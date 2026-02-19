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
2. **Persistence across restarts**: Installed tools must survive `iteron stop`
   and `iteron start` because `/home/iteron` is volume-backed.
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
| **Image** | OS base, `mise`, `/etc/mise/config.toml` (baseline agent declarations) | OCI image | Slow |
| **Manifest** | `~/.config/mise/config.toml` and `~/.config/mise/mise.lock` (user-global declarations and lockfile) | `iteron-data` volume | As needed |
| **Installed tools** | `~/.local/share/mise/` installs/downloads/shims (agent and user tool artifacts) | `iteron-data` volume | Reconciled |

### 2. mise as the package manager

IterOn uses **mise** \[1] as the user-space tool manager. It supports a global
manifest, multiple backends (including npm and GitHub), and lockfile-based
resolution \[2]\[3]\[4].

### 3. Agent CLIs are managed by mise and preinstalled

Baseline agent CLIs are declared in `/etc/mise/config.toml` (system config) and
preinstalled during image build with `mise install` \[5]\[9]. The user-global
config file (`~/.config/mise/config.toml`) is reserved for user/agent-managed
additions. This makes the baseline explicit in the image layer while preserving
runtime flexibility in the volume layer.

Per mise configuration precedence, the system config layer is higher precedence
than the user-global layer \[9], so baseline declarations are not accidentally
removed by user-global edits.

Tool invocation uses **shims** on `PATH` \[6], not shell activation hooks, so
it works for interactive sessions and non-interactive agent execution.

### 4. Users and agents can install/upgrade inside the running container

Inside the running container, users and CLI agents can manage tools with mise
commands (for example, `mise use -g ...`, `mise install`, `mise upgrade`)
\[7]\[8]\[9]. Installed artifacts remain under `/home/iteron`, so they persist
across restarts.

### 5. Reconciliation policy on container start

`iteron start` shall run reconciliation:

- `mise trust ~/.config/mise/config.toml` \[10]
- `mise install` (default, non-locked mode) \[5]\[11]

This is idempotent and rehydrates missing install artifacts after image
upgrades or volume migrations.

### 6. Locking and reproducibility

IterOn uses lockfile mode for reproducibility \[2]\[11]. For global config, the
lockfile path is `~/.config/mise/mise.lock`; for project config (`mise.toml`)
the lockfile path is also `mise.lock` \[11]\[17].

For the image-owned baseline config, the corresponding lockfile is
`/etc/mise/mise.lock` \[17]; it is baked into the image layer and updated only
on image rebuild.

Strict locked mode (`MISE_LOCKED=1` / `--locked`) is opt-in and not enabled for
default startup reconciliation, because fresh volumes may not yet contain
pre-resolved lockfile URLs \[11]. To enable strict mode safely, populate the
lockfile first with `mise lock` \[2].

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

- **Backend denylist policy**: IterOn-managed global config
  (`/etc/mise/config.toml`) and recommended user-global config
  (`~/.config/mise/config.toml`) shall enforce "only `npm:` and `github:`"
  by disabling all other backends with `disable_backends` \[12]\[18].
  In mise, `github` is a first-class backend type and participates in
  `disable_backends` filtering \[19]\[20].
  Excluding `aqua:` in this DR is a scope-simplification choice, not a claim
  that `aqua:` is less secure than `github:` \[16]. This mechanism is
  denylist-based and therefore fragile to new upstream backends. When the
  pinned mise version changes, the implementer shall compare backend names
  between current and target releases by diffing the `BackendType` enum in
  `src/backend/backend_type.rs` at the two pinned release commits, then update
  `disable_backends` accordingly \[12]\[18]\[19]\[20].
- **Lock discipline**: Any change to declarative tool versions shall include
  the corresponding lockfile update (`~/.config/mise/mise.lock` for global
  config, and `mise.lock` adjacent to workspace `mise.toml`) \[2]\[11]\[17].
- **Backend policy enforcement path**: Implementations shall enforce the
  denylist policy with `disable_backends` in mise settings \[12].

### Rejected alternatives

| Alternative | Reason |
| --- | --- |
| Custom provisioner script | Reimplements version, backend, and idempotency logic already solved by mature tooling |
| Nix | Default store path is `/nix/store` \[13]. With IterOn's read-only root filesystem ([DR-001 §1](001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)), that requires a dedicated writable `/nix` mount (extra volume design). DeterminateSystems `nix-installer --init none` documents root-only support for non-root workflows \[14]. Multi-user setup adds additional daemon/ownership operational surface \[15]. |
| Direct npm only | Cannot cover non-npm binary tools in one declarative workflow |

## Consequences

- **Uniform workflow**: one manager for preinstalled agent tools and runtime
  user/agent tool installs.
- **Persistent local behavior**: runtime installs survive restart because they
  live under `/home/iteron`.
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
