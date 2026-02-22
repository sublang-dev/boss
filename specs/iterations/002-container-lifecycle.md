<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-002: Container Lifecycle

## Goal

Implement `boss init`, `boss start`, and `boss stop` commands that automate Podman provisioning, sandbox container management, and environment configuration on macOS, Linux, and Windows (WSL2).

## Deliverables

- [x] CLI framework with `boss --help` and `boss --version`
- [x] `boss init`: install Podman, pull image, create volume and config
- [x] `boss start`: launch container with security hardening and `.env` loading
- [x] `boss stop`: graceful container shutdown
- [x] `~/.boss/config.toml` schema and generation
- [x] `~/.boss/.env` template generation

## Tasks

### 1. CLI framework setup

- Choose CLI framework and set up project structure
- Implement `boss --help` (list subcommands) and `boss --version`
- Establish error handling conventions (exit codes per POSIX)
- Provide clear error messages when Podman is not installed or container is not running

### 2. `boss init`

Per [DR-002 §1](../decisions/002-iteron-cli-commands.md#1-boss-init):

- Detect OS (macOS, Linux, Windows-WSL2) and architecture (amd64, arm64)
- Install Podman with user confirmation (show command, prompt `[Y/n]`, `--yes` to skip):
  - macOS: official `.pkg` installer downloaded from GitHub releases (recommended by Podman; works without Homebrew or MacPorts)
  - Linux: auto-detect native package manager (`apt-get`, `dnf`, `zypper`, `pacman`, `apk`)
  - WSL2: same as Linux (native Podman, no `podman machine` needed)
- Initialize `podman machine` on macOS (4 GB RAM, 2 vCPU minimum)
- Verify rootless mode is enabled (`podman info --format '{{.Host.Security.Rootless}}'`)
- Pull multi-arch OCI image from [IR-001](001-oci-sandbox-image.md)
- Create `boss-data` Podman volume
- Generate `~/.boss/config.toml` with defaults (see Task 5)
- If `~/.boss/config.toml` already exists, preserve user settings but reconcile `[container].image` when either:
  - Current image is legacy default `docker.io/library/alpine:latest` (update to default sandbox image)
  - User passes `--image <url>` (update to the provided image)
- Generate `~/.boss/.env` template with placeholder keys
- Support `--image <url>` option for custom OCI image per [DR-002 §1](../decisions/002-iteron-cli-commands.md#1-boss-init)
- Idempotent: skip steps already completed, report what was skipped or updated

### 3. `boss start`

Per [DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary) and [DR-002 §2](../decisions/002-iteron-cli-commands.md#2-boss-start):

- Read settings from `~/.boss/config.toml`
- Start `podman machine` if needed (macOS/Windows) and not already running
- Launch container with security hardening:

  ```shell
  podman run -d --name boss-sandbox \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --read-only \
    --tmpfs /tmp \
    -v boss-data:/home/boss \
    --env-file ~/.boss/.env \
    --memory 16g \
    --init \
    <image> sleep infinity
  ```

- Idempotent: if container already running, exit 0 with message

### 4. `boss stop`

Per [DR-002 §3](../decisions/002-iteron-cli-commands.md#3-boss-stop):

- Stop container with 30-second grace period (`podman stop -t 30 boss-sandbox`)
- Remove stopped container (`podman rm boss-sandbox`)
- Optionally stop `podman machine` if no other containers running (macOS/Windows)
- If container not running, exit 0 with message

### 5. Config file schema

`~/.boss/config.toml`:

```toml
[container]
name = "boss-sandbox"
image = "ghcr.io/sublang-dev/boss-sandbox:latest"
memory = "16g"
```

Agent names (`claude`, `codex`, `gemini`, `opencode`) are built-in constants — no configuration needed.

`~/.boss/.env`:

```shell
# API keys for headless agent authentication
ANTHROPIC_API_KEY=
CODEX_API_KEY=
GEMINI_API_KEY=
```

## Verification

| # | Test | Expected |
| --- | --- | --- |
| 1 | `boss init` on clean macOS | Downloads and installs Podman `.pkg`, inits machine, pulls image, creates volume and config files |
| 2 | `boss init` on clean Ubuntu | Installs Podman via `apt-get`, pulls image, creates volume and config files |
| 3 | `boss init` run twice | Second run exits 0 and reports steps as skipped or updated based on reconciliation rules |
| 4 | `boss start` then `podman container inspect boss-sandbox --format '{{.HostConfig.CapDrop}}'` | Output contains `ALL` |
| 5 | `boss start` then `podman container inspect boss-sandbox --format '{{.HostConfig.ReadonlyRootfs}}'` | `true` |
| 6 | `boss start` then `podman container inspect boss-sandbox --format '{{.HostConfig.SecurityOpt}}'` | Contains `no-new-privileges` |
| 7 | `boss start` when already running | Exits 0, prints "already running" |
| 8 | `boss stop` | Container stops within 30s; `podman ps -a --filter name=boss-sandbox` returns empty |
| 9 | `boss stop` when not running | Exits 0, prints "not running" |
| 10 | `cat ~/.boss/config.toml` after init | Valid TOML; contains `[container]` section |
| 11 | `cat ~/.boss/.env` after init | Contains `ANTHROPIC_API_KEY=`, `CODEX_API_KEY=`, `GEMINI_API_KEY=` |
| 12 | Set `ANTHROPIC_API_KEY=sk-test-123` in `.env`, `boss start`, `podman exec boss-sandbox printenv ANTHROPIC_API_KEY` | `sk-test-123` |
| 13 | `boss start`, `podman exec boss-sandbox touch /home/boss/persist-test`, `boss stop`, `boss start`, `podman exec boss-sandbox test -f /home/boss/persist-test` | Exit 0 (file persists across restart) |
| 14 | `boss --help` | Lists `init`, `start`, `stop` subcommands with one-line descriptions |
| 15 | Existing `config.toml` has `image = "docker.io/library/alpine:latest"`, run `boss init` | `config.toml` image is reconciled to `ghcr.io/sublang-dev/boss-sandbox:latest` |
| 16 | Existing `config.toml` has custom image, run `boss init` without `--image` | Custom image remains unchanged |
| 17 | Existing `config.toml` has custom image, run `boss init --image <url>` | `config.toml` image updated to `<url>` |

## Dependencies

- [IR-001](001-oci-sandbox-image.md) (image must be built and pullable)
- [DR-001](../decisions/001-sandbox-architecture.md) and [DR-002](../decisions/002-iteron-cli-commands.md) approved
