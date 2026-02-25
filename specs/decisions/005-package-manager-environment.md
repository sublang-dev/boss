<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-005: Package Manager Environment Configuration

## Status

Accepted

## Context

[DR-001 §1](001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary) runs the
container as user `boss` (UID 1000) with a read-only root filesystem and
`--cap-drop ALL`. [DR-004](004-user-tool-provisioning.md) manages language
runtime versions and standalone tool binaries via mise. The two DRs operate at
distinct layers:

| Layer | Owner |
| --- | --- |
| Runtime version selection (which Python, Node, Go, Rust) | mise (DR-004) |
| Standalone CLI tools installed from npm or GitHub releases | mise (DR-004) |
| Language package installs (`pip`, `npm -g`, `cargo install`, `go install`) | DR-005 |

This split is intentional. [DR-004 §8](004-user-tool-provisioning.md#8-supply-chain-guardrails)
restricts mise backends to **`npm:` and `github:` only** via `disable_backends`.
All backends other than `npm:` and `github:` are blocked. DR-005 provides the
canonical path for the remaining ecosystems via native package managers with
XDG env var configuration.

Three problems need explicit decisions:

1. **Default install paths require root.** `npm install -g` defaults to
   `/usr/local/lib` (read-only root filesystem); `pip install` defaults to
   system site-packages (also read-only). Without env var overrides these
   commands fail with permission errors.

2. **LLM sudo reflex.** Agents trained on general internet data reflexively
   prepend `sudo` to installation commands. With no root access, `sudo pip
   install X` fails; agents may retry indefinitely.

3. **Empty home volume on first start.** The `boss-data` volume mounts over
   `/home/boss`, hiding image-layer dotfiles and tool configs. After an image
   upgrade the volume retains stale or absent defaults from the previous image.

## Decision

### 1. XDG environment variables

All language package managers shall be configured via `ENV` in the Dockerfile
to write to user-owned directories under `~/.local`:

| Ecosystem | Variable | Effective install target |
| --- | --- | --- |
| Python | `PYTHONUSERBASE=$HOME/.local`, `PIP_USER=1` | `~/.local/lib/python*/site-packages`, `~/.local/bin` (see venv note below) |
| Node (global) | `NPM_CONFIG_PREFIX=$HOME/.local/share/npm-global` | `~/.local/share/npm-global/bin` |
| Go | `GOPATH=$HOME/.local/share/go`, `GOBIN=$HOME/.local/bin` | `~/.local/bin` |
| Rust (cargo) | `CARGO_HOME=$HOME/.local/share/cargo` | `~/.local/share/cargo/bin` |
| Rust (rustup) | `RUSTUP_HOME=$HOME/.local/share/rustup` | (toolchain storage) |
| XDG base dirs | `XDG_CONFIG_HOME=$HOME/.config`, `XDG_CACHE_HOME=$HOME/.cache`, `XDG_DATA_HOME=$HOME/.local/share`, `XDG_STATE_HOME=$HOME/.local/state` | Standard XDG layout [1] |

The Dockerfile `ENV` shall set `PATH` to the following complete prefix in
this order, before the system `$PATH`:

```
$HOME/.local/share/mise/shims:$HOME/.local/bin:$HOME/.local/share/npm-global/bin:$HOME/.local/share/cargo/bin
```

Mise shims precede all user-local directories so that mise-managed tool
versions shadow any same-named binaries installed directly via native package
managers. `~/.local/share/mise/shims` and `~/.local/bin` are already
required by [SBD-014](../dev/sandbox-image.md#sbd-014); this DR extends
that prefix with the npm-global and cargo binary directories.

**Venv exception:** `PIP_USER=1` conflicts with virtualenv: pip hard-fails
with "Can not perform a '--user' install" when `VIRTUAL_ENV` is set (confirmed
pip 25.3 / Python 3.14.2). `PIP_USER=1` shall remain in the Dockerfile `ENV`
as the default for bare agent invocations. A startup-time guard in `.bashrc`
is ineffective because `VIRTUAL_ENV` is not set until `source venv/bin/activate`
runs after `.bashrc` is sourced.

For interactive Bash shells, the image default `.bashrc` (seeded via `/opt/defaults/`)
shall include a `PROMPT_COMMAND` hook that dynamically manages `PIP_USER` based
on `VIRTUAL_ENV`. The hook runs after each command and before the next prompt,
so it fires after activation (unsets `PIP_USER`) and on the venv→no-venv
transition (restores `PIP_USER=1`). The append must be idempotent so that
re-sourcing `.bashrc` does not register the hook multiple times:

```sh
_pip_user_venv_guard() {
    if [ -n "$VIRTUAL_ENV" ]; then
        unset PIP_USER
        _BOSS_VENV_WAS_ACTIVE=1
    elif [ -n "$_BOSS_VENV_WAS_ACTIVE" ]; then
        export PIP_USER=1
        unset _BOSS_VENV_WAS_ACTIVE
    fi
    # Outside a venv and not transitioning: leave PIP_USER untouched
    # to preserve any explicit user override (e.g. `unset PIP_USER`).
}
case "${PROMPT_COMMAND:-}" in
    *_pip_user_venv_guard*) ;;
    *) PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND; }_pip_user_venv_guard" ;;
esac
```

**Known limitation:** `source venv/bin/activate && pip install X` is a single
compound command; `PROMPT_COMMAND` fires only after the whole line completes,
not between its parts. `pip install X` will execute with `PIP_USER=1` still
set and fail. Use separate commands or `unset PIP_USER` explicitly in the same
line: `source venv/bin/activate && unset PIP_USER && pip install X`.

`PROMPT_COMMAND` is Bash interactive-only. Non-interactive agent processes and
non-Bash shells must explicitly `unset PIP_USER` after activating a virtual environment.

Because `/home/boss` is volume-backed ([DR-001 §6](001-sandbox-architecture.md#6-user-local-tool-layer)),
packages installed via these managers survive container restarts and image
upgrades without reinstallation.

### 2. Mock sudo shim

A mock `sudo` script shall be placed at `/usr/local/bin/sudo` in the image
layer (not on the volume). Its flag-handling behavior shall be:

| Input form | Shim behavior |
| --- | --- |
| `sudo <cmd> [args...]` | Emit context line; exec `<cmd> [args...]` unprivileged |
| `sudo -E <cmd>` / `--preserve-env[=list]` | Discard flag (shim already runs in current env); exec `<cmd>` |
| `sudo -n <cmd>` / `-S` / `-k` / `-K` / `-v` | Discard flag; exec `<cmd>` |
| `sudo -- <cmd>` | Treat `--` as end-of-options; exec `<cmd>` |
| `sudo -u <user> ...` / `--user=<user>` | Exit 1: `sudo: user switching not supported in rootless mode` |
| `sudo -g <group> ...` / `--group=<group>` | Exit 1: `sudo: group switching not supported in rootless mode` |
| `sudo -i` / `-s` | Exit 1: `sudo: interactive shells not supported in rootless mode` |

The context line emitted on successful dispatch shall be:

```
# rootless: sudo is a no-op shim; running as boss
```

The shim must reside on a read-only image path so agents cannot replace it.

### 3. Entrypoint defaults seeding

The image shall ship `/opt/defaults/` containing pristine copies of
home-directory dotfiles and configs (`.bashrc`, mise config templates, shell
profiles, etc.). The entrypoint shall recursively seed any missing **files**
from `/opt/defaults/` into `$HOME` on every start, without overwriting
existing files:

```sh
find /opt/defaults -mindepth 1 -type f | while IFS= read -r src; do
  rel="${src#/opt/defaults/}"
  dst="$HOME/$rel"
  [ -e "$dst" ] && continue
  mkdir -p "$(dirname "$dst")"
  cp -a "$src" "$dst"
done
```

The algorithm is file-granular, not directory-granular. A top-level skip on
`$HOME/.config` would prevent new nested defaults (e.g., a new
`/opt/defaults/.config/mise/config.toml` in an upgraded image) from ever
reaching volumes that already have `~/.config`. The `find`-based approach
correctly seeds any new file at any depth while preserving all existing files.

This provides overlay-like semantics without overlayfs: `/opt/defaults/` is
the lower layer, the `boss-data` volume is the upper layer, and the entrypoint
merges them at startup. Image upgrades can introduce new default files at any
depth without overwriting user customizations.

The image shall set a Dockerfile `ENV` variable `BOSS_IMAGE_VERSION` to the
version string from `package.json`, passed at image build time via a Docker
build argument. The build shall fail if the argument is empty or absent.
For release builds, the release pipeline additionally verifies that this value
matches the git tag per [RELEASE-002](../dev/release.md#release-002); that
parity check is a release-pipeline concern, not a build-time Dockerfile
constraint. The entrypoint shall record
`$BOSS_IMAGE_VERSION` in `$XDG_STATE_HOME/.boss-image-version` on every start.
When the stored value differs from `$BOSS_IMAGE_VERSION`, the entrypoint shall
emit a diagnostic line to standard output that includes both the previous and
current values before updating the stored value, providing a hook point for
future migration scripts.

### 4. EFS configuration for Fargate deployments

[DR-001 §4](001-sandbox-architecture.md#4-aws-deployment-fargate--efs) selects
EFS for Fargate persistence. The following configuration shall be applied:

- **Throughput mode:** Elastic, not Bursting — avoids burst credit exhaustion
  during large package installs [2].
- **Performance mode:** General Purpose, not Max I/O — minimizes
  per-operation latency on development file patterns [2].
- **Access points:** One EFS Access Point per workspace with
  `rootDirectory: /workspaces/<workspace-id>` enforces tenant isolation without
  separate file systems.
- **Heavy I/O note:** For workloads that produce large numbers of small files
  (e.g., `npm install` for a large dependency tree), installing into Fargate
  ephemeral storage first and then copying to EFS can reduce NFS per-file
  latency. The specific mechanism, sync strategy, and failure handling are
  implementation concerns outside the scope of this DR.

### Rejected alternatives

| Alternative | Reason |
| --- | --- |
| Per-ecosystem named volumes | Additional mount points with no benefit over XDG layout within the single `boss-data` volume; misaligns with DR-001's single home volume |
| uv for Python only | Python-specific; does not generalize to other ecosystems; overlaps with mise's Python backend |
| Real passwordless sudo | Increases attack surface; XDG env vars eliminate the need for root during package installation |
| Nix at runtime | Covered in [DR-004 rejected alternatives](004-user-tool-provisioning.md#rejected-alternatives) |

## Consequences

- Native package manager commands (`pip install X`, `npm install -g X`,
  `cargo install X`, `go install X@latest`) resolve to user-writable paths
  without `sudo` or package manager reconfiguration; permission and
  read-only-rootfs failures are eliminated. Other failure modes (network
  errors, missing system libraries, C extension compilation) are outside
  this DR's scope.
- Installed packages persist across restarts and image upgrades because they
  resolve to paths within the `boss-data` volume.
- Common LLM sudo reflexes (`sudo <cmd>`, `sudo -E <cmd>`, `sudo -n <cmd>`)
  are silently redirected; execution proceeds unprivileged. User-switching
  forms (`sudo -u root ...`) exit 1 with an informative message rather than
  causing an indeterminate failure.
- Image upgrades seed new default config files into stale volumes on next
  start without clobbering user customizations.
- EFS Fargate deployments do not exhaust burst credits under heavy package
  install workloads.

## References

1. XDG Base Directory Specification — <https://specifications.freedesktop.org/basedir-spec/latest/>
2. Amazon EFS performance modes and throughput modes — <https://docs.aws.amazon.com/efs/latest/ug/performance.html>
