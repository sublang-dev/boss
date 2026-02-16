<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Workspace Guide

## Overview

A workspace is a directory inside the sandbox container at `/home/iteron/<name>`. Each workspace can host one or more agent sessions running in separate tmux sessions.

## Creating Workspaces

Workspaces are created automatically when you open an agent in a new workspace:

```bash
iteron open claude-code myproject
```

This creates `~/myproject` in the container (if it doesn't exist) and starts Claude Code there.

### Opening a Shell

```bash
# Shell in home directory
iteron open

# Shell in a workspace
iteron open myproject
```

### Opening an Agent

```bash
# Agent in home directory
iteron open claude-code

# Agent in a workspace
iteron open codex-cli myproject
```

## Workspace Naming Rules

Workspace names must follow these rules:

- Cannot be empty
- Cannot be absolute paths (no leading `/`)
- Cannot contain path separators (`/` or `\`)
- Cannot be `.` or `..` (path traversal)
- Cannot contain `@` (reserved as session delimiter)

Valid names: `myproject`, `feature-x`, `experiment_1`

## Running Multiple Agents

You can run different agents in different workspaces simultaneously:

```bash
# Terminal 1: Claude Code working on the backend
iteron open claude-code backend

# Terminal 2: Codex CLI working on the frontend
iteron open codex-cli frontend

# Terminal 3: Shell for manual inspection
iteron open backend
```

You can also run multiple agents in the same workspace, though they may interfere with each other's file edits.

## Listing Workspaces

```bash
iteron ls
```

Output is a tree view grouped by workspace:

```
~/ (home)
  claude-code (attached, 2h 15m)
  bash (detached, 5m)
backend/
  claude-code (attached, 45m)
frontend/
  codex-cli (attached, 30s)
```

Each entry shows:
- **Command** — the agent or command name (e.g., `claude-code`, `codex-cli`, `bash`)
- **Status** — `attached` (terminal connected) or `detached` (running in background)
- **Uptime** — how long the session has been running (`30s`, `5m`, `2h 15m`)

If no sessions are running:

```
No workspaces or sessions.
```

## Removing Workspaces

```bash
iteron rm myproject
```

If the workspace has active sessions, IterOn prompts before killing them:

```
Kill claude-code@myproject, bash@myproject? [y/N] y
Workspace "myproject" removed.
```

The home directory (`~`) cannot be removed. Use `iteron stop` to shut down the entire container.

## Data Persistence

All workspace data lives on the `iteron-data` Podman volume mounted at `/home/iteron`. This means:

- Workspaces persist across `iteron stop` / `iteron start` cycles
- Agent config changes persist (e.g., modified `.claude/settings.json`)
- Binaries installed to `~/.local/bin` persist
- Only `iteron rm <workspace>` or deleting the volume removes data

## Detach and Reattach

When you close your terminal or detach from tmux (`Ctrl-B D`), the agent keeps running inside the container. Reattach with the same `iteron open` command:

```bash
# Reattach to an existing session
iteron open claude-code myproject
```

See [Tmux Quick Reference](tmux.md) for more tmux operations.
