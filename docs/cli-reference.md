<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CLI Reference

## Global Options

```
iteron -V, --version    Print version
iteron -h, --help       Show help
```

---

## `iteron scaffold [path]`

Create the IterOn specs directory structure and templates.

### Synopsis

```
iteron scaffold [path]
```

### Arguments

| Argument | Description | Default |
| --- | --- | --- |
| `path` | Target directory | Git root or current directory |

### Behavior

- If `path` is provided, uses that directory (must exist)
- If inside a git repository, creates `specs/` at the repo root
- Otherwise, creates `specs/` in the current directory

### Examples

```bash
# Scaffold in current git repo
iteron scaffold

# Scaffold in a specific directory
iteron scaffold ~/projects/myapp
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Scaffolding complete |
| 1 | Path does not exist or is not a directory |

---

## `iteron init [options]`

Install Podman, pull the sandbox image, create the data volume, and generate configuration files.

### Synopsis

```
iteron init [--image <url>] [-y, --yes]
```

### Options

| Option | Description | Default |
| --- | --- | --- |
| `--image <url>` | Custom OCI image URL | `ghcr.io/sublang-dev/iteron-sandbox:latest` |
| `-y, --yes` | Skip confirmation prompts | Prompt |

### Behavior

1. Detect platform (macOS, Linux, WSL)
2. Check/install Podman
3. Initialize and start Podman machine (macOS)
4. Verify rootless mode
5. Pull OCI image
6. Create `iteron-data` volume
7. Write `~/.iteron/config.toml`
8. Write `~/.iteron/.env` template

### Examples

```bash
# Interactive initialization
iteron init

# Non-interactive with custom image
iteron init --image ghcr.io/myorg/custom-sandbox:v1 -y
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Initialization complete |
| 1 | Podman installation failed, rootless check failed, or image pull failed |

---

## `iteron start`

Launch the sandbox container.

### Synopsis

```
iteron start
```

### Behavior

- Reads config from `~/.iteron/config.toml`
- Loads environment variables from `~/.iteron/.env`
- Starts the container with security hardening: `--cap-drop ALL`, `--read-only`, `--security-opt no-new-privileges`
- Sets memory limit from config (default: `16g`)
- Uses `tini` as PID 1 via `--init`
- Mounts `iteron-data` volume at `/home/iteron`
- Idempotent: if already running, reports status and exits successfully

### Examples

```bash
iteron start
# Container "iteron-sandbox" is running.
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Container is running |
| 1 | Container failed to start |

---

## `iteron stop`

Stop and remove the sandbox container. Workspace data persists in the `iteron-data` volume.

### Synopsis

```
iteron stop
```

### Behavior

- Sends SIGTERM with a 30-second grace period
- Removes the container after stopping
- Volume data (`iteron-data`) is preserved

### Examples

```bash
iteron stop
# Container "iteron-sandbox" stopped and removed.
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Container stopped or was not running |

---

## `iteron open [agent-or-workspace] [workspace] [-- args]`

Open a workspace with an agent or shell. Attaches to an existing tmux session or creates a new one.

### Synopsis

```
iteron open [agent-or-workspace] [workspace] [-- extra-args]
```

### Argument Resolution

| Arguments | Command | Working Directory |
| --- | --- | --- |
| (none) | `bash` | `~` (home) |
| `<agent-name>` | Agent binary | `~` (home) |
| `<workspace>` | `bash` | `~/workspace` |
| `<agent> <workspace>` | Agent binary | `~/workspace` |

Agent names: `claude`, `codex`, `gemini`, `opencode` (from `~/.iteron/config.toml`).

### Pass-through Arguments

Everything after `--` is passed to the agent binary:

```bash
iteron open claude myproject -- --resume
# Runs: claude --resume (in ~/myproject)
```

### Session Naming

Sessions are named `{agent-or-command}@{location}`:
- `claude@myproject`
- `bash@~`
- `codex@feature-x`

### Examples

```bash
# Open a shell in home directory
iteron open

# Open Claude Code in home directory
iteron open claude

# Open Codex CLI in a workspace
iteron open codex myproject

# Open a shell in a workspace
iteron open myproject

# Pass extra arguments to agent
iteron open claude myproject -- --resume
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Session ended normally |
| 1 | Container not running, or invalid workspace name |

---

## `iteron ls`

List workspaces and running sessions.

### Synopsis

```
iteron ls
```

### Output Format

Tree view grouped by workspace location:

```
~/ (home)
  claude (attached, 2h 15m)
  bash (detached, 5m)
project/
  codex (attached, 30s)
```

Each session shows:
- **Command** (agent name or command)
- **Status** (attached or detached)
- **Uptime** (human-readable: `30s`, `5m`, `2h 15m`)

If no sessions exist:

```
No workspaces or sessions.
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Always |

---

## `iteron rm <workspace>`

Remove a workspace directory and kill its sessions.

### Synopsis

```
iteron rm <workspace>
```

### Arguments

| Argument | Description |
| --- | --- |
| `workspace` | Name of the workspace to remove (required) |

### Behavior

1. Validates workspace name (no `/`, `\`, `..`, `@`, or absolute paths)
2. If sessions exist in the workspace, prompts for confirmation to kill them
3. Removes the workspace directory recursively from the container

The home directory (`~`) cannot be removed — use `iteron stop` instead.

### Examples

```bash
iteron rm myproject
# Kill codex@myproject? [y/N] y
# Workspace "myproject" removed.
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Workspace removed |
| 1 | Missing argument, invalid name, home directory, or user aborted |
