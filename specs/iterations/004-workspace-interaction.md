<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-004: Workspace Interaction

## Goal

Implement `iteron open`, `iteron ls`, and `iteron rm` commands for launching agents in tmux sessions, managing workspaces, and observing autonomous execution. Users attach to give the initial task/prompt; agents then execute with full permissions and no approval prompts (per [IR-001 §5](001-oci-sandbox-image.md#5-agent-autonomy-configuration) autonomy defaults). Users detach and reattach freely to observe progress.

## Deliverables

- [x] `iteron open [workspace] [command] [-- <args>]`: launch agent/shell in tmux session, with agent-name-to-binary resolution
- [x] Attach-to-existing: reattach to running tmux sessions
- [x] `iteron ls`: tree view of workspaces and running sessions
- [x] `iteron rm <workspace>`: remove workspace and kill its sessions

## Tasks

### 1. `iteron open` — launch and attach

Per [DR-002 §4](../decisions/002-iteron-cli-commands.md#4-iteron-open-workspace-command----args):

- Argument interpretation (workspace-first):
  - 0 args: shell in `~`
  - 1 arg: shell in `~/<workspace>` (use `~` for home)
  - 2 args: first is workspace, second is command/agent
- Agent name resolution: second arg (command) is checked against built-in agent names (`claude`, `codex`, `gemini`, `opencode`). The agent name is used as the binary directly. If not a built-in agent, the argument is used as-is (raw command).
- Arguments after `--` are passed to the resolved command
- Wraps: `podman exec -it iteron-sandbox tmux new-session -A -s <session> -c <path> <binary> [<args>]`
- Session naming per [DR-002 Workspace Model](../decisions/002-iteron-cli-commands.md#workspace-model): `<agent-name>@<location>` (e.g., `claude@myproject`). For non-agent commands, use the command itself (e.g., `bash@~`, `vim@backend`). The `@` delimiter is used because tmux reserves `:` and silently replaces it with `_`.
- Create workspace directory inside container if it doesn't exist
- If session already exists, `-A` attaches to it (no duplicate launch)
- Error with clear message if container is not running

### 2. `iteron ls`

Per [DR-002 §5](../decisions/002-iteron-cli-commands.md#5-iteron-ls):

- Query tmux sessions from container (`podman exec iteron-sandbox tmux list-sessions -F '#{session_name} #{session_attached} #{session_activity}'`)
- Parse session names (`<command>@<location>`) to extract command and location
- Scan workspace directories under `/home/iteron` (exclude dotfiles)
- Display tree format grouping by workspace:

  ```shell
  ~/ (home)
    claude (attached, 2h 15m)
    bash (detached, 45m)
  myproject/
    claude (detached, 1h 30m)
  backend/
    gemini (detached, 10m)
  ```

- Show status (attached/detached) and uptime for each session

### 3. `iteron rm <workspace>`

Per [DR-002 §6](../decisions/002-iteron-cli-commands.md#6-iteron-rm-workspace):

- Kill all running tmux sessions whose location matches the target workspace
- Remove workspace directory (`~/workspace`) inside container
- Refuse to remove home directory (`~`) with clear error
- Confirmation prompt listing sessions that will be killed

## Verification

| # | Test | Expected |
| --- | --- | --- |
| 1 | `iteron open` | Attaches to bash in `~`; `tmux list-sessions` shows `bash@~` |
| 2 | `iteron open myproject` | Creates `~/myproject`; attaches to `bash@myproject` |
| 3 | `iteron open ~ claude` | Resolves `claude` → binary `claude` from config; attaches to `claude@~` |
| 4 | `iteron open myproject claude` | Attaches to `claude@myproject`; binary is `claude`, cwd is `~/myproject` |
| 5 | `iteron open myproject claude -- --resume` | `tmux list-sessions` shows `claude@myproject`; `--resume` passed to `claude` process (verify via `/proc/<pid>/cmdline`) |
| 6 | `iteron open myproject vim` | `vim` is not in config → runs `vim` as-is; session `vim@myproject` |
| 7 | Run `iteron open myproject claude`, detach (Ctrl-B D), run `iteron open myproject claude` again | Reattaches to same session; `tmux list-sessions` still shows exactly one `claude@myproject`. **Manual verification required** — `-A` reattach needs an interactive terminal. |
| 8 | Run `iteron open ~ claude` and `iteron open myproject claude` in parallel | Two separate sessions: `claude@~` and `claude@myproject` |
| 9 | `iteron ls` with sessions `claude@~`, `bash@myproject`, `gemini@backend` running | Tree output groups by location; shows correct attached/detached status and uptime |
| 10 | `iteron rm myproject` with `claude@myproject` running | Prompts "Kill claude@myproject? [y/N]"; on `y`: session killed, `~/myproject` removed |
| 11 | `iteron rm` (no arg) | Exit non-zero; prints usage error |
| 12 | `iteron open` when container not running | Exit non-zero; prints "Container iteron-sandbox is not running. Run `iteron start` first." |

## Dependencies

- [IR-002](002-container-lifecycle.md) (container must be startable)
- [IR-003](003-tests-ci.md) (tests and CI established)
- [DR-002](../decisions/002-iteron-cli-commands.md) approved
