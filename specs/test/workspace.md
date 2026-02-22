<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# WORKSPACE: Workspace Interaction Verification

This component defines verification checks for workspace
requirements.

## Session Identity

### WST-001

Where a session is created for command `bash` in home, the
session identity shall be `bash@~`
([WSD-001](../dev/workspace.md#wsd-001)).

### WST-002

Where a session identity contains multiple `@`, parsing shall
use the last delimiter. Where no valid delimiter exists,
parsing shall fall back to location `~`
([WSD-002](../dev/workspace.md#wsd-002)).

### WST-003

Where an agent, command, or workspace token contains `@`, it
shall be rejected
([WSD-003](../dev/workspace.md#wsd-003)).

## Input Constraints

### WST-004

Where a workspace input is `.`, `..`, absolute, or contains
`/`, `\`, or `@`, it shall be rejected
([WSD-004](../dev/workspace.md#wsd-004)).

### WST-005

Where config defines an agent name containing `@`, config load
shall fail
([WSD-003](../dev/workspace.md#wsd-003)).

## Argument Resolution

### WST-006

Where `boss open` is invoked with 0, 1, or 2 positional
arguments (including workspace `~`), resolved binary,
session identity, and working directory shall match
spec-defined branches
([WSX-001](../user/workspace.md#wsx-001)).

## Open Command

### WST-007

Where `boss open` is run twice with the same
`<agent,workspace>`, the second run shall reattach and no
duplicate session shall be created
([WSX-002](../user/workspace.md#wsx-002)).

### WST-008

Where sessions are opened in two distinct workspaces, both
sessions shall coexist
([WSX-001](../user/workspace.md#wsx-001)).

## Ls Command

### WST-009

Where home and workspace sessions exist, `boss ls` tree
output shall include `~/ (home)` plus workspace nodes in
required ordering
([WSD-007](../dev/workspace.md#wsd-007)).

## Rm Command

### WST-010

Where `boss rm` is called with `~` or without a workspace,
it shall exit non-zero
([WSX-004](../user/workspace.md#wsx-004)).

### WST-011

Where sessions exist in a workspace, `boss rm <workspace>`
shall remove the workspace and terminate its sessions after
confirmation
([WSX-004](../user/workspace.md#wsx-004)).

## Container State

### WST-012

Where the container is not running, `boss open`, `boss ls`,
and `boss rm` shall exit non-zero with a "not running" message
([WSX-005](../user/workspace.md#wsx-005)).
