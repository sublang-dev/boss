<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai> -->

# IR-004: Workspace Interaction

## Goal

Implement `iteron open`, `iteron ls`, and `iteron rm` commands for launching agents in tmux sessions, managing workspaces, and observing autonomous execution. Users attach to give the initial task/prompt; agents then execute with full permissions and no approval prompts (per [IR-001 §5](001-oci-sandbox-image.md#5-agent-autonomy-configuration) autonomy defaults). Users detach and reattach freely to observe progress.

## Deliverables

- [ ] `iteron open [agent] [workspace] [-- <args>]`: launch agent/shell in tmux session, with agent-name-to-binary resolution
- [ ] Attach-to-existing: reattach to running tmux sessions
- [ ] `iteron ls`: tree view of workspaces and running sessions
- [ ] `iteron rm <workspace>`: remove workspace and kill its sessions

## Tasks

### 1. `iteron open` — launch and attach

Per [DR-002 §4](../decisions/002-iteron-cli-commands.md#4-iteron-open-agent-workspace----args):

- Argument interpretation:
  - 0 args: shell in `~`
  - 1 arg, matches agent name in `config.toml`: agent in `~`
  - 1 arg, no match: shell in `~/workspace`
  - 2 args: first is agent/command, second is workspace
- Agent name resolution: look up agent name in `config.toml` `[agents.<name>]` to get `binary` value (see [IR-001 §2](001-oci-sandbox-image.md#2-agent-runtime-installation-and-name-mapping) and [IR-002 §5](002-container-lifecycle.md#5-config-file-schema)). If not found in config, use the argument as-is (raw command).
- Arguments after `--` are passed to the resolved command
- Wraps: `podman exec -it iteron-sandbox tmux new-session -A -s <session> -c <path> <binary> [<args>]`
- Session naming per [DR-002 Workspace Model](../decisions/002-iteron-cli-commands.md#workspace-model): `<agent-name>:<location>` (e.g., `claude-code:myproject`). For non-agent commands, use the command itself (e.g., `bash:~`, `vim:backend`).
- Create workspace directory inside container if it doesn't exist
- If session already exists, `-A` attaches to it (no duplicate launch)
- Error with clear message if container is not running

### 2. `iteron ls`

Per [DR-002 §5](../decisions/002-iteron-cli-commands.md#5-iteron-ls):

- Query tmux sessions from container (`podman exec iteron-sandbox tmux list-sessions -F '#{session_name} #{session_attached} #{session_activity}'`)
- Parse session names (`<command>:<location>`) to extract command and location
- Scan workspace directories under `/home/iteron` (exclude dotfiles)
- Display tree format grouping by workspace:

  ```shell
  ~/ (home)
    claude-code (attached, 2h 15m)
    bash (detached, 45m)
  myproject/
    claude-code (detached, 1h 30m)
  backend/
    gemini-cli (detached, 10m)
  ```

- Show status (attached/detached) and uptime for each session
- `--json` flag: output JSON array with fields `session`, `command`, `location`, `attached`, `uptime_seconds`

### 3. `iteron rm <workspace>`

Per [DR-002 §6](../decisions/002-iteron-cli-commands.md#6-iteron-rm-workspace):

- Kill all running tmux sessions whose location matches the target workspace
- Remove workspace directory (`~/workspace`) inside container
- Refuse to remove home directory (`~`) with clear error
- Confirmation prompt listing sessions that will be killed
- `--force` flag to skip confirmation

## Verification

| # | Test | Expected |
| --- | --- | --- |
| 1 | `iteron open` | Attaches to bash in `~`; `tmux list-sessions` shows `bash:~` |
| 2 | `iteron open myproject` | Creates `~/myproject`; attaches to `bash:myproject` |
| 3 | `iteron open claude-code` | Resolves `claude-code` → binary `claude` from config; attaches to `claude-code:~` |
| 4 | `iteron open claude-code myproject` | Attaches to `claude-code:myproject`; binary is `claude`, cwd is `~/myproject` |
| 5 | `iteron open claude-code myproject -- --resume` | `tmux list-sessions` shows `claude-code:myproject`; `--resume` passed to `claude` process (verify via `/proc/<pid>/cmdline`) |
| 6 | `iteron open vim myproject` | `vim` is not in config → runs `vim` as-is; session `vim:myproject` |
| 7 | Run `iteron open claude-code myproject`, detach (Ctrl-B D), run `iteron open claude-code myproject` again | Reattaches to same session; `tmux list-sessions` still shows exactly one `claude-code:myproject` |
| 8 | Run `iteron open claude-code ~` and `iteron open claude-code myproject` in parallel | Two separate sessions: `claude-code:~` and `claude-code:myproject` |
| 9 | `iteron ls` with sessions `claude-code:~`, `bash:myproject`, `gemini-cli:backend` running | Tree output groups by location; shows correct attached/detached status and uptime |
| 10 | `iteron ls --json` | Valid JSON; each entry has `session`, `command`, `location`, `attached` (bool), `uptime_seconds` (int) |
| 11 | `iteron rm myproject` with `claude-code:myproject` running | Prompts "Kill claude-code:myproject? [y/N]"; on `y`: session killed, `~/myproject` removed |
| 12 | `iteron rm myproject --force` | Skips prompt; session killed; directory removed |
| 13 | `iteron rm` (no arg) | Exit non-zero; prints usage error |
| 14 | `iteron open` when container not running | Exit non-zero; prints "Container iteron-sandbox is not running. Run `iteron start` first." |

## Dependencies

- [IR-002](002-container-lifecycle.md) (container must be startable)
- [IR-003](003-tests-ci.md) (tests and CI established)
- [DR-002](../decisions/002-iteron-cli-commands.md) approved
