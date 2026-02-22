<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CLI Reference

## Global Options

```
boss -V, --version    Print version
boss -h, --help       Show help
```

---

## `boss scaffold [path]`

Create the Boss specs directory structure and templates.

### Synopsis

```
boss scaffold [path]
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
boss scaffold

# Scaffold in a specific directory
boss scaffold ~/projects/myapp
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Scaffolding complete |
| 1 | Path does not exist or is not a directory |

---

## `boss init [options]`

Install Podman, pull the sandbox image, create the data volume, and generate configuration files.

### Synopsis

```
boss init [--image <url>] [-y, --yes]
```

### Options

| Option | Description | Default |
| --- | --- | --- |
| `--image <url>` | Custom OCI image URL | `ghcr.io/sublang-dev/boss-sandbox:latest` |
| `-y, --yes` | Skip confirmation prompts | Prompt |

### Behavior

1. Detect platform (macOS, Linux, WSL)
2. Check/install Podman
3. Initialize and start Podman machine (macOS)
4. Verify rootless mode
5. Pull OCI image
6. Create `boss-data` volume
7. Write `~/.boss/config.toml`
8. Write `~/.boss/.env` template

### Examples

```bash
# Interactive initialization
boss init

# Non-interactive with custom image
boss init --image ghcr.io/myorg/custom-sandbox:v1 -y
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Initialization complete |
| 1 | Podman installation failed, rootless check failed, or image pull failed |

---

## `boss start`

Launch the sandbox container.

### Synopsis

```
boss start
```

### Behavior

- Reads config from `~/.boss/config.toml`
- Loads environment variables from `~/.boss/.env`
- Starts the container with security hardening: `--cap-drop ALL`, `--read-only`, `--security-opt no-new-privileges`
- Sets memory limit from config (default: `16g`)
- Uses `tini` as PID 1 via `--init`
- Mounts `boss-data` volume at `/home/boss`
- Idempotent: if already running, reports status and exits successfully

### Examples

```bash
boss start
# Container "boss-sandbox" is running.
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Container is running |
| 1 | Container failed to start |

---

## `boss stop`

Stop and remove the sandbox container. Workspace data persists in the `boss-data` volume.

### Synopsis

```
boss stop
```

### Behavior

- Sends SIGTERM with a 30-second grace period
- Removes the container after stopping
- Volume data (`boss-data`) is preserved

### Examples

```bash
boss stop
# Container "boss-sandbox" stopped and removed.
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Container stopped or was not running |

---

## `boss open [workspace] [command] [-- args]`

Open a workspace with an agent or shell. Attaches to an existing tmux session or creates a new one.

### Synopsis

```
boss open [workspace] [command] [-- extra-args]
```

### Argument Resolution

| Arguments | Command | Working Directory |
| --- | --- | --- |
| (none) | `bash` | `~` (home) |
| `<workspace>` | `bash` | `~/workspace` |
| `<workspace> <agent>` | Agent binary | `~/workspace` |
| `<workspace> <command>` | Command as-is | `~/workspace` |

Use `~` as the workspace argument for the home directory. Agent names (`claude`, `codex`, `gemini`, `opencode`) are recognized as built-in agents; any other command is used as-is.

### Pass-through Arguments

Everything after `--` is passed to the agent binary:

```bash
boss open myproject claude -- --resume
# Runs: claude --resume (in ~/myproject)
```

### Session Naming

Sessions are named `{command}@{location}`:
- `claude@myproject`
- `bash@~`
- `codex@feature-x`

### Examples

```bash
# Open a shell in home directory
boss open

# Open a shell in a workspace
boss open myproject

# Open Claude Code in home directory
boss open ~ claude

# Open Codex CLI in a workspace
boss open myproject codex

# Pass extra arguments to agent
boss open myproject claude -- --resume
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Session ended normally |
| 1 | Container not running, or invalid workspace name |

---

## `boss ls`

List workspaces and running sessions.

### Synopsis

```
boss ls
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

## `boss rm <workspace>`

Remove a workspace directory and kill its sessions.

### Synopsis

```
boss rm <workspace>
```

### Arguments

| Argument | Description |
| --- | --- |
| `workspace` | Name of the workspace to remove (required) |

### Behavior

1. Validates workspace name (no `/`, `\`, `..`, `@`, or absolute paths)
2. If sessions exist in the workspace, prompts for confirmation to kill them
3. Removes the workspace directory recursively from the container

The home directory (`~`) cannot be removed — use `boss stop` instead.

### Examples

```bash
boss rm myproject
# Kill codex@myproject? [y/N] y
# Workspace "myproject" removed.
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Workspace removed |
| 1 | Missing argument, invalid name, home directory, or user aborted |
