<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai> -->

# SANDBOX: User-Facing Sandbox Image Behavior

This component defines user-visible behavior of the local IterOn
sandbox image.

## Availability

### SBX-001

Where a container runs from the official sandbox image, when a
user opens a shell in the container, the container shall expose
`claude`, `codex`, `gemini`, and `opencode` on `PATH`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBX-002

Where the container is started with default entrypoint and
command, the shell shall run as user `iteron` (`uid=1000`,
`gid=1000`) in `/home/iteron`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary),
[DR-002 Workspace Model](../decisions/002-iteron-cli-commands.md#workspace-model)).

## Runtime Behavior

### SBX-003

Where the container is started read-only with tmpfs `/tmp`, when
processes write outside `/tmp` and `/home/iteron`, the writes
shall fail
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBX-004

Where a user attaches to tmux in the container, tmux shall have
interactive defaults: 10,000-line history, terminal type
`screen-256color`, mouse mode enabled, and a status bar showing
session name and time
([DR-001 §2](../decisions/001-sandbox-architecture.md#2-tmux-mapping)).

### SBX-005

Where default agent configs are present, when users start agent
sessions, the agents shall run without onboarding or interactive
permission gates for standard file and shell actions
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary),
[DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)).
