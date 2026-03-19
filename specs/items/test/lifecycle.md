<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LCD: Container Lifecycle Verification

## Intent

This spec defines verification checks for container lifecycle
commands that prepare and launch the local Boss sandbox.

## Initialization

### LCD-55

Verifies: [LCD-3](../dev/lifecycle.md#lcd-3)

Where `boss init` runs on a non-rootless container runtime, the
command shall exit non-zero and refuse to proceed
([LCD-3](../dev/lifecycle.md#lcd-3)).

## Container Hardening

### LCD-53

Verifies: [LCD-4](../dev/lifecycle.md#lcd-4)

Where `boss start` has launched the container, container inspection
shall show all Linux capabilities dropped
([LCD-4](../dev/lifecycle.md#lcd-4)).

### LCD-54

Verifies: [LCD-4](../dev/lifecycle.md#lcd-4)

Where `boss start` has launched the container, container security
options shall include no-new-privileges
([LCD-4](../dev/lifecycle.md#lcd-4)).

## Headless Authentication

### LCD-51

Verifies: [LCD-1](../dev/lifecycle.md#lcd-1)

Where `boss init` creates `~/.boss/.env`, the template shall
contain placeholders for `CLAUDE_CODE_OAUTH_TOKEN`,
`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, and `GEMINI_API_KEY`
([LCD-1](../dev/lifecycle.md#lcd-1)).

### LCD-52

Verifies: [LCD-2](../dev/lifecycle.md#lcd-2)

Where `~/.boss/.env` defines `CLAUDE_CODE_OAUTH_TOKEN=<value>`,
when the container starts, `printenv CLAUDE_CODE_OAUTH_TOKEN`
inside the container shall equal `<value>`
([LCD-2](../dev/lifecycle.md#lcd-2)).

## SSH Authentication

### LCD-56

Verifies: [LCD-5](../dev/lifecycle.md#lcd-5)

Where `boss start` is invoked with `[auth.ssh] mode = "keyfile"`
and `keyfiles` listing one or more host keys, when the container
is running, `~/.ssh/config.d/boss.conf` inside the container shall
contain an `IdentityFile` directive for each configured key in the
declared order, and each referenced key file shall exist on an
ephemeral tmpfs
([LCD-5](../dev/lifecycle.md#lcd-5)).

### LCD-57

Verifies: [LCD-5](../dev/lifecycle.md#lcd-5)

Where `boss start` is invoked with SSH auth off or unconfigured,
`~/.ssh/config.d/boss.conf` shall not exist inside the container
([LCD-5](../dev/lifecycle.md#lcd-5)).

### LCD-58

Verifies: [LCD-6](../dev/lifecycle.md#lcd-6)

Where `boss-sandbox:<tag>` is built, `/etc/ssh/ssh_known_hosts`
shall contain host keys for `github.com` and `gitlab.com`, and
`/etc/ssh/ssh_config.d/boss.conf` shall include
`StrictHostKeyChecking yes`
([LCD-6](../dev/lifecycle.md#lcd-6)).

## Tool Provisioning

### LCD-59

Verifies: [LCD-7](../dev/lifecycle.md#lcd-7)

Where `boss start` launches the sandbox container and the
entrypoint records `should_warn=1` in
`$XDG_STATE_HOME/.boss-mise-reconcile.state`, `boss start` shall
surface the latest reconciliation warning to the user
([LCD-7](../dev/lifecycle.md#lcd-7)).
