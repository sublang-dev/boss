<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# WORKSPACE: Workspace Interaction Requirements

This component defines normative behavior requirements for workspace
commands (`open`, `ls`, `rm`) and session identity.

## Session Identity

### WSD-001

Where a workspace session is represented, its identity shall be
`<command>@<location>` across create/list/remove
flows
([DR-002 Workspace Model](../decisions/002-iteron-cli-commands.md#workspace-model)).

### WSD-002

Where a session identity is parsed from tmux output, including
non-Boss or legacy names, the rightmost `@` shall define the
command/location split. Where no valid delimiter is present, the full
name shall be treated as command and location shall default to `~`.

## Input Constraints

### WSD-003

Where agent names, command names, or workspace names are used in
session identity, each shall reject the reserved delimiter `@`
([DR-002 §4](../decisions/002-iteron-cli-commands.md#4-boss-open-workspace-command----args)).

### WSD-004

Where a workspace name is accepted from user input, it shall reject
absolute paths, path separators (`/`, `\`), and traversal segments
(`.`, `..`).

## Open Behavior

### WSD-005

Where `boss open` targets a non-home workspace and that directory
is absent, the CLI shall create it before launching the session.

## Ls Behavior

### WSD-006

Where `boss ls` returns running sessions, including non-Boss or
legacy names, it shall tolerate malformed session metadata by ignoring
invalid rows rather than failing the command
([DR-002 §5](../decisions/002-iteron-cli-commands.md#5-boss-ls)).

### WSD-007

Where `boss ls` formats output, it shall include both active sessions
and discovered workspace directories, including workspaces with no
active sessions. Tree view shall list `~/ (home)` first, then
workspaces alphabetically
([WSX-003](../user/workspace.md#wsx-003)).
