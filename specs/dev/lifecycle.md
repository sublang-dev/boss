<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LIFECYCLE: Container Lifecycle Requirements

This component defines implementation requirements for lifecycle
commands that prepare and launch the local IterOn sandbox.

## Initialization

### LCD-003

Where `iteron init` verifies the container runtime, initialization
shall refuse to proceed if the runtime is not operating in rootless
mode
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

## Container Hardening

### LCD-004

Where `iteron start` launches the sandbox container, the container
shall run with all Linux capabilities dropped, new-privilege
acquisition disabled, and a read-only root filesystem with a writable
tmpfs at `/tmp`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

## Headless Authentication

### LCD-001

Where `iteron init` creates `~/.iteron/.env`, the template shall
include placeholders for `CLAUDE_CODE_OAUTH_TOKEN`,
`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, and `GEMINI_API_KEY`
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication),
[DR-002 §1](../decisions/002-iteron-cli-commands.md#1-iteron-init)).

### LCD-002

Where `iteron start` launches the sandbox container,
authentication variables from `~/.iteron/.env` shall be exposed to
processes in the container environment
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication),
[DR-002 §2](../decisions/002-iteron-cli-commands.md#2-iteron-start)).

## SSH Authentication

### LCD-005

Where `iteron start` is invoked with `[auth.ssh] mode = "keyfile"`,
the command shall bind-mount the host key file read-only into the
container and write an `IdentityFile` directive in the container SSH
config pointing to the mounted path
([DR-003 §2](../decisions/003-runtime-profiled-auth.md#2-local-profile)).

### LCD-006

The sandbox image shall pre-seed `/etc/ssh/ssh_known_hosts` with
GitHub and GitLab.com host keys and enforce `StrictHostKeyChecking yes`
via `/etc/ssh/ssh_config.d/iteron.conf`
([DR-003 §2](../decisions/003-runtime-profiled-auth.md#2-local-profile)).
