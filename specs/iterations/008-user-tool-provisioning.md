<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-008: User-Space Tool Provisioning via mise

## Goal

Migrate agent CLI installation from direct npm/binary installs to mise-managed provisioning, implementing the three-layer model defined in [DR-004](../decisions/004-user-tool-provisioning.md): image-baked baseline declarations, a user-global manifest on the persistent volume, and reconciliation on container start.

## Deliverables

- [x] mise binary installed in sandbox image (pinned version)
- [x] System config `/etc/mise/config.toml` with baseline agent declarations and backend denylist
- [x] Lockfile `/etc/mise/mise.lock` baked into image layer
- [x] Agent CLIs preinstalled via `mise install` during image build
- [x] mise shims on `PATH` for non-interactive tool invocation
- [x] User-global config template at `~/.config/mise/config.toml`
- [x] Start-time reconciliation in `iteron start`
- [x] Dev, test, and user spec updates

## Tasks

### 1. Install mise binary in Dockerfile

Pin to mise v2026.2.16 ([DR-004 refs 17, 19](../decisions/004-user-tool-provisioning.md)). Download the standalone musl binary from GitHub releases, architecture-selected via `TARGETARCH`:

```dockerfile
ARG MISE_VERSION=2026.2.16
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) arch=x86_64  ;; \
      arm64) arch=aarch64  ;; \
      *)     echo "unsupported arch: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/jdx/mise/releases/download/v${MISE_VERSION}/mise-v${MISE_VERSION}-linux-${arch}-musl.tar.gz" \
      | tar xz -C /usr/local/bin --strip-components=1 && \
    mise --version
```

Install as root into `/usr/local/bin` so it's available to all users and survives read-only rootfs.

### 2. System config with baseline declarations and backend denylist

Create `image/conf/mise-system.toml` and `COPY` to `/etc/mise/config.toml` in the Dockerfile.

Per [DR-004 §3](../decisions/004-user-tool-provisioning.md), system config has higher precedence than user-global config, so baseline declarations cannot be accidentally removed.

```toml
[settings]
lockfile = true
disable_backends = [
  "aqua", "asdf", "cargo", "conda", "dotnet",
  "forgejo", "gem", "gitlab", "go", "http",
  "pipx", "s3", "spm", "ubi", "vfox",
]

[tools]
"npm:@anthropic-ai/claude-code" = "latest"
"npm:@google/gemini-cli" = "latest"
"npm:opencode-ai" = "latest"

[tools."github:openai/codex"]
version = "latest"
version_prefix = "rust-v"
```

Backend denylist: per [DR-004 §8](../decisions/004-user-tool-provisioning.md), disable all backends except `npm` and `github`. The list above reflects the full backend catalog as of mise v2026.2.16 ([DR-004 ref 18](../decisions/004-user-tool-provisioning.md)). When the pinned mise version changes, diff `BackendType` in `src/backend/backend_type.rs` between releases and update accordingly.

Codex uses the `github:` backend with `version_prefix = "rust-v"` because its releases are tagged as `rust-v<version>` (e.g., `rust-v0.98.0`). Verify the `version_prefix` resolves the correct release tag during implementation.

**Version resolution note:** Baseline tools use `latest` to match the existing Dockerfile behavior (npm install without pinning). Each image build re-resolves `latest` to current upstream versions via `mise lock`; the resulting lockfile captures exact resolved versions. The build-phase install then uses `--locked` mode for determinism. Runtime consistency comes from the lockfile: start-time reconciliation (`mise install` in default non-locked mode) rehydrates the same versions the image was built with. Artifact identity is the immutable image digest (`sha256:...`), not the mutable tag — the lockfile does not provide cross-build reproducibility since `latest` re-resolves on each build.

### 3. Replace direct agent installs with mise

Remove from the Dockerfile:

- `npm install -g @anthropic-ai/claude-code @google/gemini-cli opencode-ai`
- `npm install -g npm@11.10.0` (mise npm backend manages its own npm usage)
- `npm cache clean --force`
- The Codex standalone binary download block (`ARG CODEX_VERSION`, `curl | tar`)
- The binary verification block (`claude --version && codex --version ...`)

Replace with a two-phase build sequence. The root phase generates the lockfile at `/etc/mise/mise.lock` (root-owned directory). The iteron phase installs tools into `~/.local/share/mise/` using the pre-resolved lockfile.

**Root phase** (before `USER iteron`):

```dockerfile
COPY conf/mise-system.toml /etc/mise/config.toml
RUN mise lock --config-file /etc/mise/config.toml
```

This resolves `latest` versions from upstream registries and writes `/etc/mise/mise.lock` ([DR-004 §6](../decisions/004-user-tool-provisioning.md)). Verify during implementation whether `mise lock` needs the explicit `--config-file` flag or reads `/etc/mise/config.toml` automatically.

If `mise lock` cannot resolve without install artifacts, alternative: run `mise install` as root into a temporary `MISE_DATA_DIR`, copy the resulting lockfile to `/etc/mise/mise.lock`, and clean up before switching users.

**Iteron phase** (after `USER iteron`):

```dockerfile
USER iteron
WORKDIR /home/iteron
RUN mise trust /etc/mise/config.toml \
 && mise install --locked \
 && mise reshim
```

`mise install --locked` reads the system config, enforces the pre-resolved lockfile (no version re-resolution of `latest`), and installs the exact versions captured by `mise lock`. `mise reshim` generates shims at `~/.local/share/mise/shims/`. Non-locked mode is reserved for runtime reconciliation on `iteron start`, where the volume may need rehydration from updated declarations.

**Verification** (still as iteron):

```dockerfile
RUN claude --version \
 && codex --help > /dev/null \
 && gemini --version \
 && opencode --version
```

### 4. Shims PATH setup

Prepend mise shims directory to `PATH` via `ENV`:

```dockerfile
ENV PATH="/home/iteron/.local/share/mise/shims:/home/iteron/.local/bin:${PATH}"
```

Per [DR-004 §3](../decisions/004-user-tool-provisioning.md), shims are used instead of shell activation hooks so tools work in both interactive sessions and non-interactive agent execution.

The shims directory must come before `~/.local/bin` so mise-managed tools take precedence. User-local binaries at `~/.local/bin` still work for tools not managed by mise.

### 5. User-global config template

Create an empty user-global config at `~/.config/mise/config.toml` during image build:

```dockerfile
RUN mkdir -p /home/iteron/.config/mise
COPY --chown=iteron:iteron conf/mise-user.toml /home/iteron/.config/mise/config.toml
```

The template file (`image/conf/mise-user.toml`):

```toml
# User-global mise configuration.
# Add tools with: mise use -g <backend>:<package>
# See: https://mise.jdx.dev/

[settings]
disable_backends = [
  "aqua", "asdf", "cargo", "conda", "dotnet",
  "forgejo", "gem", "gitlab", "go", "http",
  "pipx", "s3", "spm", "ubi", "vfox",
]
```

Per [DR-004 §8](../decisions/004-user-tool-provisioning.md), the backend denylist is replicated in user-global config as a recommendation. The system config enforces the baseline; user-global config extends it for user/agent additions.

### 6. Start-time reconciliation

Per [DR-004 §5](../decisions/004-user-tool-provisioning.md), `iteron start` shall run reconciliation after the container starts:

```typescript
// DR-004: reconcile mise tools (idempotent, locked mode)
await podmanExec(['exec', name, 'mise', 'trust', '/etc/mise/config.toml']);
await podmanExec(['exec', name, 'mise', 'trust', '/home/iteron/.config/mise/config.toml']);
await podmanExec(['exec', name, 'mise', 'install', '--locked']);
```

Add this to `src/commands/start.ts` after the existing `mkdir -p ~/.local/bin` reconciliation step.

`mise trust` marks both the system and user-global configs as trusted so mise processes them; trust state lives on the volume and may be empty on first start. `mise install --locked` rehydrates missing install artifacts using the image-baked lockfile at `/etc/mise/mise.lock` — needed after image upgrades when the volume persists but image-layer installs are overwritten. `--locked` is required because the container rootfs is read-only at runtime.

This step is idempotent: if all tools are already installed at the declared versions, `mise install` exits immediately.

### 7. Spec updates

#### Dev specs (`specs/dev/sandbox-image.md`)

Add new requirements:

- **SBD-024**: Where the image is built, `mise` shall be installed at a pinned version and its binary shall be on `PATH` ([DR-004 §2](../decisions/004-user-tool-provisioning.md)).
- **SBD-025**: Where the image is built, `/etc/mise/config.toml` shall declare all baseline agent CLIs and enforce a backend denylist allowing only `npm` and `github` backends ([DR-004 §3, §8](../decisions/004-user-tool-provisioning.md)).
- **SBD-026**: Where the image is built, `/etc/mise/mise.lock` shall contain resolved versions for all declared baseline tools ([DR-004 §6](../decisions/004-user-tool-provisioning.md)).
- **SBD-027**: Where the image is built, agent CLI binaries shall be invocable via mise shims on `PATH` ([DR-004 §3](../decisions/004-user-tool-provisioning.md)).

Update existing:

- **SBD-002**: Change "the build shall install Claude Code, Gemini CLI, and OpenCode via npm and install Codex from a pinned standalone Linux musl release binary" → "the build shall install all agent CLIs via mise using npm and github backends".
- **SBD-014**: Add mise shims to `PATH` ordering: `~/.local/share/mise/shims` before `~/.local/bin`.

#### Dev specs (`specs/dev/lifecycle.md`)

Add:

- **LCD-007**: Where `iteron start` launches the sandbox container, the start sequence shall run `mise trust` on the system and user-global configs and `mise install --locked` to reconcile tool installations ([DR-004 §5](../decisions/004-user-tool-provisioning.md)).

#### Test specs (`specs/test/sandbox-image.md`)

Add:

- **SBT-046**: Where `iteron-sandbox:<tag>` is built, `mise --version` in the container shall exit 0 and print the pinned version ([SBD-024](../dev/sandbox-image.md#sbd-024)).
- **SBT-047**: Where `iteron-sandbox:<tag>` is built, `/etc/mise/config.toml` shall declare `npm:@anthropic-ai/claude-code`, `npm:@google/gemini-cli`, `npm:opencode-ai`, and `github:openai/codex` ([SBD-025](../dev/sandbox-image.md#sbd-025)).
- **SBT-048**: Where `iteron-sandbox:<tag>` is built, `/etc/mise/mise.lock` shall exist and contain version entries for all declared tools ([SBD-026](../dev/sandbox-image.md#sbd-026)).
- **SBT-049**: Where `iteron-sandbox:<tag>` is built, `claude --version`, `codex --help`, `gemini --version`, and `opencode --version` shall each exit 0 via mise shims ([SBD-027](../dev/sandbox-image.md#sbd-027)).

#### User specs (`specs/user/sandbox-image.md`)

Update SBX-011 or add:

- **SBX-013**: Where a user runs `mise use -g <backend>:<package>` inside the container, the tool shall be installed and available on `PATH` via shims, persisting across container restarts ([DR-004 §4](../decisions/004-user-tool-provisioning.md)).

### 8. Documentation updates

#### `docs/agents.md`

Add a "Tool Management" section explaining:

- Agent CLIs are managed by mise (no manual installation needed)
- Users can install additional tools: `mise use -g npm:<package>` or `mise use -g github:<owner>/<repo>`
- Installed tools persist across container restarts (volume-backed)
- `mise upgrade` to update tools to latest versions

#### `docs/troubleshooting.md`

Add troubleshooting entries:

- "Agent binary not found after image upgrade" → run `mise install` inside the container or restart with `iteron stop && iteron start`
- "mise install fails during start" → check network connectivity; mise needs to download tools on first start after image upgrade

#### IR-001 (`specs/iterations/001-oci-sandbox-image.md`)

Update Task 2 to reflect that agent installation uses mise instead of direct npm/binary installs.

#### spec-map.md

Add IR-008 row to the Iterations table.

## Verification

| # | Test | Expected |
| --- | --- | --- |
| 1 | `podman build --platform linux/amd64 image/` | Exit 0, image tagged |
| 2 | `podman run --rm <image> mise --version` | Exit 0, prints `2026.2.16 ...` |
| 3 | `podman run --rm <image> claude --version` | Exit 0, prints version (via shim) |
| 4 | `podman run --rm <image> codex --help` | Exit 0, prints usage (via shim) |
| 5 | `podman run --rm <image> gemini --version` | Exit 0, prints version (via shim) |
| 6 | `podman run --rm <image> opencode --version` | Exit 0, prints version (via shim) |
| 7 | `podman run --rm <image> cat /etc/mise/config.toml` | Contains `disable_backends`, all four agent tool declarations |
| 8 | `podman run --rm <image> test -f /etc/mise/mise.lock` | Exit 0 |
| 9 | `podman run --rm <image> which claude` | Path contains `mise/shims` |
| 10 | `podman run --rm <image> mise ls` | Lists all four agents with installed versions |
| 11 | Start container, `podman exec <name> mise install` | Idempotent, exits 0 quickly |
| 12 | Fresh volume + `iteron start`, `podman exec <name> claude --version` | Exit 0 (reconciliation installed tools) |
| 13 | `podman run --rm <image> cat /home/iteron/.config/mise/config.toml` | Contains `disable_backends` |
| 14 | Image size with mise vs previous | Increase ≤ 50 MB compressed (mise binary ~30 MB) |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| mise github backend can't resolve Codex release tags | Codex not installed | Test `version_prefix = "rust-v"` during build; fall back to manual install wrapped in mise config if needed |
| Reconciliation downloads on every start | Slow container start | `mise install` is idempotent and skips installed tools; only downloads on version mismatch or missing artifacts |
| mise shims add invocation latency | Slightly slower agent startup | Shims are symlinks to mise binary (~10ms overhead); acceptable for CLI tool launch |
| Backend catalog changes in future mise versions | New backends bypass denylist | Per DR-004 §8: diff `BackendType` enum when updating pinned version; update `disable_backends` |

## Dependencies

- [DR-004](../decisions/004-user-tool-provisioning.md) approved
- [IR-001](001-oci-sandbox-image.md) (base image structure)
- [IR-002](002-container-lifecycle.md) (`iteron start` reconciliation hook)
- [IR-007](007-reliability-security.md) (vulnerability scanning must pass after change)
