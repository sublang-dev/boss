<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LIFECYCLE: Container Lifecycle Requirements

This component defines implementation requirements for lifecycle
commands that prepare and launch the local Boss sandbox.

## Initialization

### LCD-003

Where `boss init` verifies the container runtime, initialization
shall refuse to proceed if the runtime is not operating in rootless
mode
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

## Container Hardening

### LCD-004

Where `boss start` launches the sandbox container, the container
shall run with all Linux capabilities dropped, new-privilege
acquisition disabled, and a read-only root filesystem with a writable
tmpfs at `/tmp`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

## Headless Authentication

### LCD-001

Where `boss init` creates `~/.boss/.env`, the template shall
include placeholders for `CLAUDE_CODE_OAUTH_TOKEN`,
`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, and `GEMINI_API_KEY`
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication),
[DR-002 §1](../decisions/002-iteron-cli-commands.md#1-boss-init)).

### LCD-002

Where `boss start` launches the sandbox container,
authentication variables from `~/.boss/.env` shall be exposed to
processes in the container environment
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication),
[DR-002 §2](../decisions/002-iteron-cli-commands.md#2-boss-start)).

## SSH Authentication

### LCD-005

Where `boss start` is invoked with `[auth.ssh] mode = "keyfile"`,
the command shall inject each configured host key into an ephemeral
tmpfs inside the container and write an `IdentityFile` directive per
key to a managed include file (`~/.ssh/config.d/boss.conf`),
preserving any user SSH config. SSH tries keys in the order listed
in `keyfiles`. When SSH is off or unconfigured, the managed file
shall be removed to prevent stale `IdentityFile` directives from
persisting on the volume
([DR-003 §2](../decisions/003-runtime-profiled-auth.md#2-local-profile)).

### LCD-006

The sandbox image shall pre-seed `/etc/ssh/ssh_known_hosts` with
GitHub and GitLab.com host keys and enforce `StrictHostKeyChecking yes`
via `/etc/ssh/ssh_config.d/boss.conf`
([DR-003 §2](../decisions/003-runtime-profiled-auth.md#2-local-profile)).

## Tool Provisioning

### LCD-007

Where `boss start` launches the sandbox container, the command
shall attempt `mise trust` on both `/etc/mise/config.toml` and
`~/.config/mise/config.toml`, then `mise install --locked` inside
the container after the container reaches the running state.
Reconciliation is best-effort: failures are logged as warnings but
do not abort startup (tools are already present on fresh volumes).
This rehydrates missing installs after image upgrades or volume
migrations ([DR-004 §5](../decisions/004-user-tool-provisioning.md)).
