<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Workspace Guide

## Overview

A workspace is a directory inside the sandbox container at `/home/boss/<name>`. Each workspace can host one or more agent sessions running in separate tmux sessions.

## Creating Workspaces

Workspaces are created automatically when you open an agent in a new workspace:

```bash
boss open myproject claude
```

This creates `~/myproject` in the container (if it doesn't exist) and starts Claude Code there.

### Opening a Shell

```bash
# Shell in home directory
boss open

# Shell in a workspace
boss open myproject
```

### Opening an Agent

```bash
# Agent in home directory
boss open ~ claude

# Agent in a workspace
boss open myproject codex
```

## Workspace Naming Rules

Workspace names must follow these rules:

- Cannot be empty
- Cannot be absolute paths (no leading `/`)
- Cannot contain path separators (`/` or `\`)
- Cannot be `.` or `..` (path traversal)
- Cannot contain `@` (reserved as session delimiter)

Valid names: `myproject`, `feature-x`, `experiment_1`

With workspace-first grammar, the first argument is always the workspace and the second is the command. There is no ambiguity between agent names and workspace names.

## Running Multiple Agents

You can run different agents in different workspaces simultaneously:

```bash
# Terminal 1: Claude Code working on the backend
boss open backend claude

# Terminal 2: Codex CLI working on the frontend
boss open frontend codex

# Terminal 3: Shell for manual inspection
boss open backend
```

You can also run multiple agents in the same workspace, though they may interfere with each other's file edits.

## Listing Workspaces

```bash
boss ls
```

Output is a tree view grouped by workspace:

```
~/ (home)
  claude (attached, 2h 15m)
  bash (detached, 5m)
backend/
  claude (attached, 45m)
frontend/
  codex (attached, 30s)
```

Each entry shows:
- **Command** — the agent or command name (e.g., `claude`, `codex`, `bash`)
- **Status** — `attached` (terminal connected) or `detached` (running in background)
- **Uptime** — how long the session has been running (`30s`, `5m`, `2h 15m`)

If no sessions are running:

```
No workspaces or sessions.
```

## Removing Workspaces

```bash
boss rm myproject
```

If the workspace has active sessions, Boss prompts before killing them:

```
Kill claude@myproject, bash@myproject? [y/N] y
Workspace "myproject" removed.
```

The home directory (`~`) cannot be removed. Use `boss stop` to shut down the entire container.

## Data Persistence

All workspace data lives on the `boss-data` Podman volume mounted at `/home/boss`. This means:

- Workspaces persist across `boss stop` / `boss start` cycles
- Agent config changes persist (e.g., modified `.claude/settings.json`)
- Binaries installed to `~/.local/bin` persist
- Only `boss rm <workspace>` or deleting the volume removes data

## Detach and Reattach

When you close your terminal or detach from tmux (`Ctrl-B D`), the agent keeps running inside the container. Reattach with the same `boss open` command:

```bash
# Reattach to an existing session
boss open myproject claude
```

See [Tmux Quick Reference](tmux.md) for more tmux operations.
