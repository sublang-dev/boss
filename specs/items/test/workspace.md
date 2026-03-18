<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# WS: Workspace Interaction Verification

## Intent

This spec defines verification checks for workspace
requirements.

## Session Identity

### WS-13

Verifies: [WS-1](../dev/workspace.md#ws-1)

Where a session is created for command `bash` in home, the
session identity shall be `bash@~`
([WS-1](../dev/workspace.md#ws-1)).

### WS-14

Verifies: [WS-2](../dev/workspace.md#ws-2)

Where a session identity contains multiple `@`, parsing shall
use the last delimiter. Where no valid delimiter exists,
parsing shall fall back to location `~`
([WS-2](../dev/workspace.md#ws-2)).

### WS-15

Verifies: [WS-3](../dev/workspace.md#ws-3)

Where an agent, command, or workspace token contains `@`, it
shall be rejected
([WS-3](../dev/workspace.md#ws-3)).

## Input Constraints

### WS-16

Verifies: [WS-3](../dev/workspace.md#ws-3), [WS-4](../dev/workspace.md#ws-4)

Where a workspace input is `.`, `..`, absolute, or contains
`/`, `\`, or `@`, it shall be rejected
([WS-3](../dev/workspace.md#ws-3), [WS-4](../dev/workspace.md#ws-4)).

### WS-17

Verifies: [WS-3](../dev/workspace.md#ws-3)

Where config defines an agent name containing `@`, config load
shall fail
([WS-3](../dev/workspace.md#ws-3)).

## Argument Resolution

### WS-18

Verifies: [WS-8](../user/workspace.md#ws-8)

Where `boss open` is invoked with 0, 1, or 2 positional
arguments (including workspace `~`), resolved binary,
session identity, and working directory shall match
spec-defined branches
([WS-8](../user/workspace.md#ws-8)).

## Open Command

### WS-19

Verifies: [WS-9](../user/workspace.md#ws-9)

Where `boss open` is run twice with the same
`<agent,workspace>`, the second run shall reattach and no
duplicate session shall be created
([WS-9](../user/workspace.md#ws-9)).

### WS-20

Verifies: [WS-8](../user/workspace.md#ws-8)

Where sessions are opened in two distinct workspaces, both
sessions shall coexist
([WS-8](../user/workspace.md#ws-8)).

## Ls Command

### WS-21

Verifies: [WS-7](../dev/workspace.md#ws-7)

Where home and workspace sessions exist, `boss ls` tree
output shall include `~/ (home)` plus workspace nodes in
required ordering
([WS-7](../dev/workspace.md#ws-7)).

## Rm Command

### WS-22

Verifies: [WS-11](../user/workspace.md#ws-11)

Where `boss rm` is called with `~` or without a workspace,
it shall exit non-zero
([WS-11](../user/workspace.md#ws-11)).

### WS-23

Verifies: [WS-11](../user/workspace.md#ws-11)

Where sessions exist in a workspace, `boss rm <workspace>`
shall remove the workspace and terminate its sessions after
confirmation
([WS-11](../user/workspace.md#ws-11)).

## Container State

### WS-24

Verifies: [WS-12](../user/workspace.md#ws-12)

Where the container is not running, `boss ls` and `boss rm`
shall exit non-zero with a "not running" message.  `boss open`
shall auto-start the container before opening the session
([WS-12](../user/workspace.md#ws-12)).
