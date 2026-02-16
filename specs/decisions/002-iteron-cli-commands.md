<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-002: IterOn CLI Command Structure

## Status

Accepted

## Context

IterOn manages CLI coding agents inside OCI containers ([DR-001](001-sandbox-architecture.md)). Users need a simple command interface to set up the sandbox, start/stop containers, interact with agents, and manage lifecycle—without manually invoking `podman`, `tmux`, or container orchestration commands.

The CLI must:

- **Hide complexity**: Users think in terms of "agents" and "workspaces," not containers or tmux sessions
- **Be discoverable**: Clear, guessable command names following common CLI conventions
- **Minimize cognitive load**: Small surface area, orthogonal commands, consistent patterns

## Decision

**Workspaces** are isolated project directories where agents work. One sandbox supports multiple workspaces, allowing users to run agents on different projects without container overhead.

### Minimal Command Set

Only commands that provide IterOn-specific value. Advanced users use `podman` directly for container lifecycle.

```shell
iteron <command> [options] [args]
```

### Workspace Model

**Workspaces** are project directories within the container's home directory. Per [DR-001](001-sandbox-architecture.md), one sandbox container supports multiple workspaces to avoid container proliferation.

- Container home: `/home/iteron` (backed by single `iteron-data` Podman volume)
- Agent state: `~/.claude/`, `~/.codex/`, `~/.gemini/`, `~/.opencode/`
- Home directory: `~` (can run agents/shells directly here)
- Workspaces: `~/<workspace>` (e.g., `~/myproject`, `~/backend`, `~/frontend`)
- Each session gets a unique tmux session name: `<command>@<location>` (e.g., `claude@myproject`, `bash@~`, `vim@backend`). The `@` delimiter is used because tmux reserves `:` as a session-window separator and silently replaces it with `_`.
- Everything persists across container restarts in one volume

### Core Commands

#### 1. `iteron init`

One-time environment setup. Installs Podman, pulls sandbox image, creates volume, generates config.

**Options**:

- `--image <url>` — Use custom OCI image

---

#### 2. `iteron start`

Start the sandbox container with security hardening flags.

---

#### 3. `iteron stop`

Stop the sandbox container.

---

#### 4. `iteron open [agent] [workspace] [-- <args>...]`

Open a workspace with an agent or shell. Creates workspace directory and tmux session if needed, otherwise attaches to existing session.

**Argument interpretation**:

- `iteron open` — Shell in home directory (`~`)
- `iteron open myproject` — Shell in `~/myproject` workspace (if no agent name)
- `iteron open claude` — Claude Code agent in home directory (`~`)
- `iteron open claude myproject` — Claude Code agent in `~/myproject` workspace
- `iteron open claude myproject -- --resume` — Pass `--resume` to claude

**Reserved agent names**: claude, codex, gemini, opencode (from `~/.iteron/config.toml`)

**Tmux control**: Full tmux access once inside (split panes, customize via `~/.tmux.conf`)

---

#### 5. `iteron ls`

List workspaces and their running agents in tree format.

**Output example**:

```shell
~/ (home)
  claude (attached, 2h 15m)
  bash (detached, 45m)

myproject/
  claude (attached, 1h 30m)
  codex (detached, 20m)

backend/
  gemini (detached, 10m)
```

---

#### 6. `iteron rm <workspace>`

Remove a workspace directory and kill any running agent sessions in it.

---

## Command Summary

| Command | Purpose | Alternative |
| --- | --- | --- |
| `iteron init` | One-time setup | Manual podman install + config |
| `iteron start` | Start sandbox | `podman run -d --name iteron-sandbox [complex flags]` |
| `iteron stop` | Stop sandbox | `podman stop iteron-sandbox` |
| `iteron open [agent] [workspace] [-- <args>]` | Open workspace (shell or agent) | `podman exec -it ... tmux new -A -s ...` |
| `iteron ls` | List workspaces and agents (tree) | `podman exec ... tmux list-sessions` + parsing |
| `iteron rm <workspace>` | Remove workspace | `podman exec iteron-sandbox rm -rf ~/workspace` |

**Less common operations** (use standard Podman or shell commands):

- Logs: `podman logs [-f] iteron-sandbox`
- Status: `podman ps | grep iteron-sandbox`
- Shell in container: `podman exec -it iteron-sandbox bash`
- Workspace contents: Navigate with shell once inside (e.g., `iteron open myproject` then `ls`)
- Image update: `podman pull ghcr.io/sublang-dev/iteron-sandbox:latest && iteron stop && iteron start`

## Consequences

### Benefits

- **Minimal command set**: 6 commands cover all common operations
- **Intuitive naming**: `open` matches user mental model ("open project with Claude")
- **Home directory default**: No artificial "default workspace"; just use `~` when no workspace specified
- **Multi-workspace support**: One sandbox, multiple projects
- **Full tmux control**: Users can split panes, customize layout via `~/.tmux.conf`

### Trade-offs

- **Some Podman knowledge needed**: For logs, restart, volume backup (documented clearly)
- **No auto-start**: `iteron open` doesn't auto-start container (clear error messages guide users)
- **Destructive rm**: `iteron rm` deletes workspace; requires confirmation prompt for safety
- **Home directory clutter**: Running agents in `~` without workspace can mix with other files

### Configuration

`iteron init` generates:

- **`~/.iteron/config.toml`** — Agent definitions, sandbox settings (container name, memory limit, security flags)
- **`~/.iteron/.env`** — Template for environment variables (API keys, git-ignored)

## References

- [DR-001: Sandbox Architecture](001-sandbox-architecture.md) — tmux session mapping, container security, single-container multi-workspace model
- POSIX exit codes — <https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html>
- tmux man page — <https://man7.org/linux/man-pages/man1/tmux.1.html>
- Podman CLI reference — <https://docs.podman.io/en/latest/Commands.html>
- TOML specification — <https://toml.io/>
