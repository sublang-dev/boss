<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SANDBOX: User-Facing Sandbox Image Behavior

This component defines user-visible behavior of the local Boss
sandbox image.

## Availability

### SBX-001

Where a container runs from the official sandbox image, when a
user opens a shell in the container, the container shall expose
`claude`, `codex`, `gemini`, and `opencode` on `PATH`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBX-002

Where the container is started with default entrypoint and
command, the shell shall run as user `boss` (`uid=1000`,
`gid=1000`) in `/home/boss`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary),
[DR-002 Workspace Model](../decisions/002-iteron-cli-commands.md#workspace-model)).

## Runtime Behavior

### SBX-003

Where the container is started read-only with tmpfs `/tmp`, when
processes write outside `/tmp` and `/home/boss`, the writes
shall fail
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBX-012

Where a user opens a shell or agent session in the container,
the locale shall be `en_US.UTF-8` so that Unicode characters
render correctly
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBX-004

Where a user attaches to tmux in the container, tmux shall have
interactive defaults: 10,000-line history, terminal type
`screen-256color`, mouse mode off by default (toggleable with
`Ctrl-B m`, persisted across restarts), and a status bar showing
session name and time
([DR-001 §2](../decisions/001-sandbox-architecture.md#2-tmux-mapping)).

### SBX-005

Where default agent configs are present, when users start agent
sessions, the agents shall run without onboarding or interactive
permission gates for standard file and shell actions
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary),
[DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)).

## Headless Authentication

### SBX-006

Where a user sets `CLAUDE_CODE_OAUTH_TOKEN` in `~/.boss/.env`,
when the sandbox container is started, Claude Code commands shall
run without interactive login prompts
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)).

### SBX-007

Where `CLAUDE_CODE_OAUTH_TOKEN` is unset and
`ANTHROPIC_API_KEY` is set in `~/.boss/.env`, Claude Code
non-interactive commands shall authenticate with API key fallback
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)).

### SBX-008

Where a user opens a Codex CLI session in the sandbox, Codex
subscription authentication shall be completable through a
terminal device-code flow, and `CODEX_API_KEY` shall be accepted
as fallback for non-interactive execution
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)).

### SBX-009

Where a user opens a Gemini CLI session in the sandbox, Gemini
subscription authentication shall be completable through a
terminal URL/code flow without requiring an in-container browser,
and `GEMINI_API_KEY` shall be accepted as fallback
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)).

### SBX-010

Where host OpenCode credentials exist at the supported host path,
OpenCode commands in the sandbox shall be able to use forwarded
credentials without a separate login; where credentials are absent,
sandbox startup shall still succeed and provider API-key
environment variables shall remain usable
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)).

## User-Local Tool Layer

### SBX-011

Where a user places a standalone binary in `~/.local/bin` inside
the container, the binary shall be found by name on `PATH`
([DR-001 §6](../decisions/001-sandbox-architecture.md#6-user-local-tool-layer)).

### SBX-013

Where a user runs `mise use -g <backend>:<package>` inside the
container, the tool shall be installed and available on `PATH`
via shims, persisting across container restarts
([DR-004 §4](../decisions/004-user-tool-provisioning.md)).
