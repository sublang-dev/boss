<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai> -->

# IR-002: Container Lifecycle

## Goal

Implement `iteron init`, `iteron start`, and `iteron stop` commands that automate Podman provisioning, sandbox container management, and environment configuration on macOS, Linux, and Windows (WSL2).

## Deliverables

- [ ] CLI framework with `iteron --help` and `iteron --version`
- [ ] `iteron init`: install Podman, pull image, create volume and config
- [ ] `iteron start`: launch container with security hardening and `.env` loading
- [ ] `iteron stop`: graceful container shutdown
- [ ] `~/.iteron/config.toml` schema and generation
- [ ] `~/.iteron/.env` template generation

## Tasks

### 1. CLI framework setup

- Choose CLI framework and set up project structure
- Implement `iteron --help` (list subcommands) and `iteron --version`
- Establish error handling conventions (exit codes per POSIX)
- Provide clear error messages when Podman is not installed or container is not running

### 2. `iteron init`

Per [DR-002 §1](../decisions/002-iteron-cli-commands.md#1-iteron-init):

- Detect OS (macOS, Linux, Windows-WSL2) and architecture (amd64, arm64)
- Install Podman via system package manager:
  - macOS: Homebrew (`brew install podman`)
  - Linux: `apt install podman` (Debian/Ubuntu) or `dnf install podman` (Fedora/RHEL)
  - WSL2: `apt install podman` inside the WSL distribution
- Initialize `podman machine` on macOS/Windows (4 GB RAM, 2 vCPU minimum)
- Verify rootless mode is enabled (`podman info --format '{{.Host.Security.Rootless}}'`)
- Pull multi-arch OCI image from [IR-001](001-oci-sandbox-image.md)
- Create `iteron-data` Podman volume
- Generate `~/.iteron/config.toml` with defaults (see Task 5), including the agent name mapping from [IR-001 §2](001-oci-sandbox-image.md#2-agent-runtime-installation-and-name-mapping)
- Generate `~/.iteron/.env` template with placeholder keys
- Support `--image <url>` option for custom OCI image per [DR-002 §1](../decisions/002-iteron-cli-commands.md#1-iteron-init)
- Idempotent: skip steps already completed, report what was skipped

### 3. `iteron start`

Per [DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary) and [DR-002 §2](../decisions/002-iteron-cli-commands.md#2-iteron-start):

- Read settings from `~/.iteron/config.toml`
- Start `podman machine` if needed (macOS/Windows) and not already running
- Launch container with security hardening:
  ```
  podman run -d --name iteron-sandbox \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --read-only \
    --tmpfs /tmp \
    -v iteron-data:/home/iteron \
    --env-file ~/.iteron/.env \
    --memory 16g \
    --init \
    <image> sleep infinity
  ```
- Idempotent: if container already running, exit 0 with message

### 4. `iteron stop`

Per [DR-002 §3](../decisions/002-iteron-cli-commands.md#3-iteron-stop):

- Stop container with 30-second grace period (`podman stop -t 30 iteron-sandbox`)
- Remove stopped container (`podman rm iteron-sandbox`)
- Optionally stop `podman machine` if no other containers running (macOS/Windows)
- If container not running, exit 0 with message

### 5. Config file schema

`~/.iteron/config.toml`:

```toml
[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang/iteron-sandbox:latest"
memory = "16g"

[agents.claude-code]
binary = "claude"

[agents.codex-cli]
binary = "codex"

[agents.gemini-cli]
binary = "gemini"

[agents.opencode]
binary = "opencode"
```

`~/.iteron/.env`:

```shell
# API keys for headless agent authentication
ANTHROPIC_API_KEY=
CODEX_API_KEY=
GEMINI_API_KEY=
```

## Verification

| # | Test | Expected |
| --- | --- | --- |
| 1 | `iteron init` on clean macOS | Installs Podman via Homebrew, inits machine, pulls image, creates volume and config files |
| 2 | `iteron init` on clean Ubuntu | Installs Podman via apt, pulls image, creates volume and config files |
| 3 | `iteron init` run twice | Second run skips completed steps, exits 0, prints what was skipped |
| 4 | `iteron start` then `podman inspect iteron-sandbox --format '{{.HostConfig.CapDrop}}'` | Output contains `ALL` |
| 5 | `iteron start` then `podman inspect iteron-sandbox --format '{{.HostConfig.ReadonlyRootfs}}'` | `true` |
| 6 | `iteron start` then `podman inspect iteron-sandbox --format '{{.HostConfig.SecurityOpt}}'` | Contains `no-new-privileges` |
| 7 | `iteron start` when already running | Exits 0, prints "already running" |
| 8 | `iteron stop` | Container stops within 30s; `podman ps -a --filter name=iteron-sandbox` returns empty |
| 9 | `iteron stop` when not running | Exits 0, prints "not running" |
| 10 | `cat ~/.iteron/config.toml` after init | Valid TOML; contains `[container]` and `[agents.claude-code]` with `binary = "claude"` |
| 11 | `cat ~/.iteron/.env` after init | Contains `ANTHROPIC_API_KEY=`, `CODEX_API_KEY=`, `GEMINI_API_KEY=` |
| 12 | Set `ANTHROPIC_API_KEY=sk-test-123` in `.env`, `iteron start`, `podman exec iteron-sandbox printenv ANTHROPIC_API_KEY` | `sk-test-123` |
| 13 | `iteron start`, `podman exec iteron-sandbox touch /home/iteron/persist-test`, `iteron stop`, `iteron start`, `podman exec iteron-sandbox test -f /home/iteron/persist-test` | Exit 0 (file persists across restart) |
| 14 | `iteron --help` | Lists `init`, `start`, `stop` subcommands with one-line descriptions |

## Non-Goals

- Workspace interaction commands (`open`, `ls`, `rm`) — see [IR-003](003-workspace-interaction.md)
- Agent-specific authentication setup — see [IR-004](004-headless-auth.md)
- Podman machine auto-stop on idle (optimization for later)

## Dependencies

- [IR-001](001-oci-sandbox-image.md) (image must be built and pullable)
- [DR-001](../decisions/001-sandbox-architecture.md) and [DR-002](../decisions/002-iteron-cli-commands.md) approved
