<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-004: User-Space Tool Provisioning via mise

## Status

Accepted (implementation pending)

## Context

[DR-001 §6](001-sandbox-architecture.md#6-user-local-tool-layer) establishes a
user-local tool layer at `~/.local/bin` and defers a declarative manifest for
runtime tool provisioning. The next design must satisfy these priorities:

1. **Easy install and upgrade**: Users and agents need a single workflow for
   adding and upgrading CLIs without rebuilding the base image.
2. **Persistence across restarts**: Installed tools must survive `boss stop`
   and `boss start` because `/home/boss` is volume-backed.
3. **Easy foundation image upgrades**: New base images must not require manual
   reinstall choreography.
4. **Future local/AWS parity**: Declarative intent should sync; machine-local
   install artifacts should not.

Managing every binary with ad-hoc scripts would require reimplementing backend
resolution, archive handling, version selection, and idempotency logic that a
mature tool manager already provides.

## Decision

### 1. Three-layer provisioning model

Tools are separated by lifecycle:

| Layer | Contents | Storage | Change cadence |
| --- | --- | --- | --- |
| **Image** | OS base, `mise`, `/etc/mise/config.toml` (baseline agent and runtime declarations) | OCI image | Slow |
| **Manifest** | `~/.config/mise/config.toml` and `~/.config/mise/mise.lock` (user-global declarations and lockfile) | `boss-data` volume | As needed |
| **Installed tools** | `~/.local/share/mise/` installs/downloads/shims (agent and user tool artifacts) | `boss-data` volume | Reconciled |

### 2. mise as the package manager

Boss uses **mise** \[1] as the user-space tool manager. It supports a global
manifest, multiple backends (including npm and GitHub), and lockfile-based
resolution \[2]\[3]\[4].

### 3. Baseline tools and language runtimes are declared in the image config and preinstalled

Baseline agent CLIs **and language runtimes** are declared in
`/etc/mise/config.toml` (system config) and preinstalled during image build
with `mise install` \[5]\[9]. The user-global config file
(`~/.config/mise/config.toml`) is reserved for user/agent-managed additions.
This makes the baseline explicit in the image layer while preserving runtime
flexibility in the volume layer.

Language runtimes (Python, Go, Rust) follow the same declaration pattern as
agent CLIs. Node.js is the one exception: because the base image is
`node:22-bookworm-slim` ([DR-001 §1](001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)),
Node.js 22 is provided by the base layer and does not require a separate mise
declaration.

Agents may switch or add runtime versions at runtime — for example,
`mise use -g python@3.13` or `mise use -g go@1.24` — and the new version is
downloaded to `~/.local/share/mise/` on the `boss-data` volume, persisting
across restarts without an image rebuild.

Per mise configuration precedence, the system config layer is higher precedence
than the user-global layer \[9], so baseline declarations are not accidentally
removed by user-global edits.

Tool invocation uses **shims** on `PATH` \[6], not shell activation hooks, so
it works for interactive sessions and non-interactive agent execution.

### 4. Users and agents can install/upgrade inside the running container

Inside the running container, users and CLI agents can manage tools with mise
commands (for example, `mise use -g ...`, `mise install`, `mise upgrade`)
\[7]\[8]\[9]. Installed artifacts remain under `/home/boss`, so they persist
across restarts.

### 5. Reconciliation policy on container start

Container startup entrypoint shall run reconciliation in two phases:

- `mise trust /etc/mise/config.toml` \[10]
- `mise trust ~/.config/mise/config.toml` \[10]
- **System phase (locked):** stage `/etc/mise/config.toml` + `/etc/mise/mise.lock`
  into a writable temp project directory, then run
  `mise -C <temp-dir> install --locked` \[5]\[11]
- **User phase (locked, conditional):** if `~/.config/mise/mise.lock` exists,
  run `mise install --locked` with `/etc/mise/config.toml` ignored so
  reconciliation targets user-global tools only

Trust state lives under `/home/boss` (on the persistent volume) and may be
empty on first start or stale after image upgrades, so both configs are
re-trusted unconditionally. Split phases are required because runtime rootfs is
read-only: direct writes near `/etc/mise/mise.lock` are not allowed. The system
phase keeps strict lockfile resolution by using an image-owned lockfile staged
to writable temp storage. The user phase is strict only when a user lockfile is
present.

If user tools are declared but `~/.config/mise/mise.lock` is absent, user-phase
reconciliation is skipped and startup emits an actionable soft warning
(`run mise lock`) once per dedupe key.

Reconciliation is best-effort: failures are logged as warnings but do not
abort container startup. On a fresh volume the tools are already present
(populated from the image), so reconciliation only matters after image
upgrades when the volume has stale artifacts.

Entrypoint shall record reconciliation state at
`$XDG_STATE_HOME/.boss-mise-reconcile.state`, including:

- status (`ok`, `error`, `skipped`)
- fingerprint derived from image version plus hashes of system/user mise
  config+lock files
- failed step + class/message for warnings:
  error failures use `status=error`; advisory hints (for example
  `user_lock_missing`) keep `status=ok`
- `should_warn` flag for host-side surfacing

When status is `error`, warning dedupe shall key on
`(fingerprint, failed_step, error_class)` so repeated failures stay quiet on
routine restarts, while image upgrades (fingerprint changes) re-surface
warnings.

`boss start` shall read this state file after container startup and surface the
latest reconciliation warning when `should_warn=1`.

### 6. Locking and reproducibility

Boss uses lockfile mode for reproducibility \[2]\[11]. For global config, the
lockfile path is `~/.config/mise/mise.lock`; for project config (`mise.toml`)
the lockfile path is also `mise.lock` \[11]\[17].

For the image-owned baseline config, the corresponding lockfile is
`/etc/mise/mise.lock` \[17]; it is baked into the image layer and updated only
on image rebuild.

Startup reconciliation uses strict locked mode (`--locked`) in both phases.
System-phase locked resolution uses a temp project copy of image-owned lock
data; user-phase locked resolution is conditional on user lockfile presence.
Fresh volumes remain safe because user-global config starts as a template with
no declared tools.

### 7. Sync boundaries for future AWS profile

To preserve local/AWS parity while avoiding architecture leaks:

| Path | Sync to AWS | Reason |
| --- | --- | --- |
| `/etc/mise/mise.lock` | N/A (image-owned) | Resolved baseline tool versions baked into OCI image; changed only by image rebuild |
| `~/.config/mise/config.toml` | Yes | Declarative, architecture-neutral |
| `~/.config/mise/mise.lock` | Yes | Reproducible global resolution |
| `mise.lock` (workspace) | Yes | Reproducible workspace resolution |
| `~/.local/share/mise/` | **No** | Platform binaries; re-provisioned on AWS start |
| `~/.local/state/mise/` | **No** | Machine-local trust and cache state |

### 8. Supply-chain guardrails

To reduce drift and constrain resolution behavior:

- **Backend denylist policy**: Boss-managed global config
  (`/etc/mise/config.toml`) and recommended user-global config
  (`~/.config/mise/config.toml`) shall enforce "only `npm:` and `github:`"
  by disabling all other backends with `disable_backends` \[12]\[18].
  User-phase reconciliation intentionally isolates `/etc/mise/config.toml`,
  so system settings do not override user settings during that phase. Guardrail
  enforcement therefore depends on the denylist being present in user-global
  config as well.
  In mise, `github` is a first-class backend type and participates in
  `disable_backends` filtering \[19]\[20].
  Excluding `aqua:` in this DR is a scope-simplification choice, not a claim
  that `aqua:` is less secure than `github:` \[16]. This mechanism is
  denylist-based and therefore fragile to new upstream backends. When the
  pinned mise version changes, the implementer shall compare backend names
  between current and target releases by diffing the `BackendType` enum in
  `src/backend/backend_type.rs` at the two pinned release commits, then update
  `disable_backends` accordingly \[12]\[18]\[19]\[20].
  **Scope of the denylist:** `disable_backends` applies to pluggable
  tool-installation backends — the colon-prefixed forms such as `cargo:X`,
  `go:X`, `ubi:X`, `aqua:X`, `pipx:X`. Core language runtime declarations
  (`python = "3.12"`, `go = "1.23"`, `rust = "stable"`) use mise's built-in
  plugin system and are **not** affected by `disable_backends`.
- **Lock discipline**: Any change to declarative tool versions shall include
  the corresponding lockfile update (`~/.config/mise/mise.lock` for global
  config, and `mise.lock` adjacent to workspace `mise.toml`) \[2]\[11]\[17].
- **Backend policy enforcement path**: Implementations shall enforce the
  denylist policy with `disable_backends` in mise settings \[12].

### Rejected alternatives

| Alternative | Reason |
| --- | --- |
| Custom provisioner script | Reimplements version, backend, and idempotency logic already solved by mature tooling |
| Nix | Default store path is `/nix/store` \[13]. With Boss's read-only root filesystem ([DR-001 §1](001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)), that requires a dedicated writable `/nix` mount (extra volume design). DeterminateSystems `nix-installer --init none` documents root-only support for non-root workflows \[14]. Multi-user setup adds additional daemon/ownership operational surface \[15]. |
| Direct npm only | Cannot cover non-npm binary tools in one declarative workflow |

## Consequences

- **Uniform workflow**: one manager for preinstalled agent tools and runtime
  user/agent tool installs.
- **Persistent local behavior**: runtime installs survive restart because they
  live under `/home/boss`.
- **Clean image upgrades**: startup reconciliation restores expected tools.
- **Parity-friendly**: sync config/lock only; rehydrate platform artifacts in
  each environment.
- **Defined guardrails**: backend denylist policy and lock discipline bound
  supply-chain drift and runtime variance.

## References

1. mise docs — <https://mise.jdx.dev/>
2. mise lockfile — <https://mise.jdx.dev/dev-tools/mise-lock.html>
3. mise npm backend — <https://mise.jdx.dev/dev-tools/backends/npm.html>
4. mise GitHub backend — <https://mise.jdx.dev/dev-tools/backends/github.html>
5. mise install command — <https://mise.jdx.dev/cli/install.html>
6. mise shims — <https://mise.jdx.dev/dev-tools/shims.html>
7. mise use command — <https://mise.jdx.dev/cli/use.html>
8. mise upgrade command — <https://mise.jdx.dev/cli/upgrade.html>
9. mise global config — <https://mise.jdx.dev/configuration.html>
10. mise trust command — <https://mise.jdx.dev/cli/trust.html>
11. mise settings (`lockfile`, `locked`) — <https://mise.jdx.dev/configuration/settings.html>
12. mise settings (`disable_backends`) — <https://mise.jdx.dev/configuration/settings.html#disable-backends>
13. Nix `store` default (`/nix/store`) — <https://nix.dev/manual/nix/latest/command-ref/conf-file.html#conf-store>
14. DeterminateSystems `nix-installer` (`--init none` root-only note) — <https://github.com/DeterminateSystems/nix-installer>
15. Nix multi-user installation (canonical stable manual) — <https://nixos.org/manual/nix/stable/installation/multi-user.html>
16. mise `aqua` backend reference — <https://mise.jdx.dev/dev-tools/backends/aqua.html>
17. mise source (v2026.2.16): lockfile path derivation (`lockfile_path_for_config`) — <https://github.com/jdx/mise/blob/031430cf61c6729fb34ab147635da5f4a4685b37/src/lockfile.rs#L448-L477>
18. mise backend catalog (set of backends to deny) — <https://mise.jdx.dev/dev-tools/backends/>
19. mise source (v2026.2.16): backend type definitions (`BackendType`) — <https://github.com/jdx/mise/blob/031430cf61c6729fb34ab147635da5f4a4685b37/src/backend/backend_type.rs#L15-L73>
20. mise source (v2026.2.16): `disable_backends` filtering in backend loader — <https://github.com/jdx/mise/blob/031430cf61c6729fb34ab147635da5f4a4685b37/src/backend/mod.rs#L191-L195>
