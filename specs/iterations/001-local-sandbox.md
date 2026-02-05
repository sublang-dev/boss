<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai> -->

# IR-001: Local Sandbox Implementation

## Goal

Implement local OCI container-based sandbox environment for autonomous CLI coding agents (Claude Code, Codex CLI, Gemini CLI, OpenCode) using Podman on macOS, Linux, and Windows (WSL2).

## Deliverables

- [ ] Podman provisioning script for macOS, Linux, Windows (WSL2)
- [ ] Multi-arch OCI image (amd64, arm64) with all agent runtimes
- [ ] IterOn CLI: `init`, `start`, `stop`, `open`, `ls`, `rm` (6 commands) per [DR-002](../decisions/002-iteron-cli-commands.md)
- [ ] Authentication layer (API keys, subscription flows)
- [ ] Memory leak mitigation (cgroup limits, tini)
- [ ] Security hardening (capability drops, read-only root, no-new-privileges)
- [ ] Local validation tests

## Tasks

### Phase 1: Local Container Infrastructure

1. **Podman installation automation**
   - Detect OS and architecture (macOS/Linux/Windows-WSL2, amd64/arm64)
   - Install Podman via system package manager (Homebrew on macOS, apt/dnf on Linux)
   - Initialize `podman machine` on macOS/Windows with appropriate resources (4 GB RAM, 2 vCPU minimum)
   - Implement auto-start/stop for `podman machine` to minimize idle memory footprint
   - Verify rootless mode is enabled by default

2. **Volume management**
   - Create single Podman volume: `iteron-data`
   - Mount at `/home/iteron` in container
   - Agent state stored at `~/.claude/`, `~/.codex/`, `~/.gemini/`, `~/.opencode/`
   - Workspaces stored as `~/<workspace>` (e.g., `~/myproject`)
   - Ensure writable `/tmp` mount inside container
   - Document volume backup/restore procedures

### Phase 2: OCI Image Build

3. **Base image and runtime installation**
   - Use `node:22-bookworm-slim` as base (Debian Bookworm, ~30 MB)
   - Install multi-arch builds: `docker buildx` or Podman manifest lists
   - Target platforms: `linux/amd64`, `linux/arm64`
   - Install glibc dependencies for Codex CLI Rust binary

4. **Agent runtime installation**
   - Install Claude Code via npm (`@anthropic-ai/claude-code`)
   - Install Gemini CLI via npm (`@google/gemini-cli`)
   - Download Codex CLI Rust binary (architecture-specific from releases)
   - Clone and install OpenCode fork (`anomalyco/opencode`)
   - Verify all agents can be invoked headlessly

5. **Init system and utilities**
   - Add `tini` as PID 1 for signal forwarding and zombie reaping
   - Install `tmux` for session management
   - Install `bash`, `git`, `curl`, `jq` for agent script execution
   - Configure tmux with sane defaults (status bar, history limit)

6. **Security hardening**
   - Set container user to non-root (UID 1000, GID 1000, username: `iteron`)
   - Configure read-only root filesystem (`--read-only`)
   - Drop all capabilities (`--cap-drop ALL`)
   - Enable `--security-opt no-new-privileges`
   - Define writable volumes explicitly (`/tmp`, `/home/iteron`)

### Phase 3: CLI Implementation

7. **`iteron init` command**
   - Install Podman via system package manager if missing
   - Initialize Podman machine on macOS/Windows
   - Pull multi-arch OCI image
   - Create `iteron-data` volume
   - Generate `~/.iteron/config.toml` with agent definitions and container settings
   - Create template `~/.iteron/.env` file for API keys

8. **`iteron start` command**
   - Read container settings from `~/.iteron/config.toml`
   - Start Podman machine if needed (macOS/Windows)
   - Run container with security hardening flags (`--cap-drop ALL`, `--read-only`, etc.)
   - Load environment from `~/.iteron/.env`
   - Mount `iteron-data` volume at `/home/iteron`
   - Idempotent: no-op if already running

9. **`iteron stop` command**
   - Stop sandbox container gracefully (30s timeout)

10. **`iteron open` command**
    - Implement `iteron open [agent] [workspace] [-- <args>]` per [DR-002](../decisions/002-iteron-cli-commands.md)
    - Argument interpretation logic:
      - 0 args: shell in home directory (`~`)
      - 1 arg: check against known agent names from config
        - If match: agent in home directory
        - If no match: shell in `~/<workspace>`
      - 2 args: first arg is agent/command, second is workspace
    - Wrapper around `podman exec -it iteron-sandbox tmux new -A -s <session> -c <path> <command>`
    - Parse arguments after `--` separator and pass to command
    - Create workspace directory if it doesn't exist (not needed for home)
    - Create tmux session if needed, otherwise attach to existing
    - Session naming: `<command>:<location>` (e.g., `bash:~`, `claude-code:myproject`)
    - Provide clear error messages if container not running
    - Examples:
      - `iteron open` → shell in `~`
      - `iteron open myproject` → shell in `~/myproject`
      - `iteron open claude-code myproject -- --resume` → claude-code with --resume flag

11. **`iteron ls` command**
    - List tmux sessions from container and workspace directories
    - Parse session names to extract command and location
    - Group by workspace location (home vs workspace directories)
    - Display in tree format showing workspaces and their running agents/shells
    - Show status (attached/detached) and uptime for each session
    - Support `--json` flag for machine-readable output
    - Example output:
      ```
      ~/ (home)
        claude-code (attached, 2h 15m)
        bash (detached, 45m)
      myproject/
        claude-code (attached, 1h 30m)
      backend/
        gemini-cli (detached, 10m)
      ```

12. **`iteron rm` command**
    - Kill any running sessions in workspace (from tmux list)
    - Remove workspace directory `~/<workspace>`
    - Error if trying to remove home directory
    - Require confirmation prompt (show sessions that will be killed)
    - Support `--force` flag to skip confirmation

### Phase 4: Authentication

13. **API key injection**
    - Support environment variables: `ANTHROPIC_API_KEY`, `CODEX_API_KEY`, `GEMINI_API_KEY`
    - Read from `~/.iteron/.env` file loaded via `--env-file` flag
    - Document `.env` file format and key requirements per agent

14. **Claude Code headless configuration**
    - Auto-generate `~/.claude.json` with `hasCompletedOnboarding: true`
    - Document `apiKeyHelper` configuration for dynamic key retrieval
    - Set `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` for key caching

15. **Subscription authentication flows** (optional, for non-API-key users)
    - Codex CLI: document `codex login --device-auth` flow
    - Gemini CLI: document Google Cloud service account setup
    - Note limitations and manual steps required

### Phase 5: Testing and Validation

16. **Security validation**
    - Verify rootless mode on local Podman (`podman inspect --format '{{.HostConfig.UsernsMode}}'`)
    - Confirm capabilities are dropped (`CapDrop: ALL`)
    - Test read-only root filesystem (attempt write outside allowed volumes)
    - Validate `no-new-privileges` prevents privilege escalation
    - Run vulnerability scan on OCI image (Trivy, Grype)

17. **Agent compatibility tests**
    - Claude Code: verify headless onboarding bypass, execute multi-turn task
    - Codex CLI: test `codex exec` with API key, verify glibc linkage
    - Gemini CLI: validate Node 20+ runtime, execute sample command
    - OpenCode: verify TypeScript execution, test basic code generation
    - Document any agent-specific quirks or configuration requirements

18. **Memory leak mitigation validation**
    - Set `--memory` limits (16 GB) with headroom for agent leaks
    - Test container restart policy on OOM
    - Benchmark memory usage over 8-hour autonomous run
    - Document tini signal handling and zombie reaping

19. **Documentation and runbooks**
    - Installation guide (local Podman setup via `iteron init`)
    - CLI reference for all 6 commands
    - Agent configuration reference (API keys, subscription auth)
    - Workspace usage guide (`open`, `ls`, `rm`)
    - Tmux quick reference (pane splits, navigation, customization via `~/.tmux.conf`)
    - Troubleshooting guide (common errors, memory leaks, auth failures)
    - Examples: multi-workspace workflow, tmux pane layouts

## Acceptance Criteria

- All four agents (Claude Code, Codex CLI, Gemini CLI, OpenCode) execute successfully in local container
- `iteron start` starts sandbox with all security hardening flags
- `iteron stop` gracefully stops sandbox
- `iteron open` works with no args (shell in `~`), workspace arg (shell in workspace), or agent+workspace (agent in workspace)
- `iteron open` disambiguates single arg by checking against known agent names from config
- `iteron open` supports argument pass-through: `iteron open claude-code myproject -- --resume`
- Multiple agents can work in different locations simultaneously (e.g., `claude-code:~`, `claude-code:myproject`, `bash:backend`)
- `iteron ls` shows tree view of home and workspaces with their running sessions, status, and uptime
- `iteron rm <workspace>` kills sessions and removes workspace after confirmation
- Tmux sessions survive host connection drops and can be reattached via `iteron open`
- Users can split panes and customize tmux layout using standard tmux keybindings
- API key authentication works for all agents in headless mode
- Container enforces security hardening (rootless, read-only root, no capabilities, no-new-privileges)
- Memory limits and tini init mitigate agent memory leaks for 8+ hour runs
- Single `iteron-data` volume preserves agent state, workspaces, and tmux config across container restarts
- Documentation complete: installation, CLI reference, workspace guide, tmux usage, troubleshooting

## Non-Goals (Phase 1)

- AWS deployment (Fargate, EFS, Secrets Manager)
- Credential-injecting proxy
- Multi-agent orchestration or inter-agent communication
- Graphical UI for agent monitoring
- Automatic agent error recovery or task retry logic
- Integration with external task queues or workflow engines

## Dependencies

- [DR-001](../decisions/001-sandbox-architecture.md) and [DR-002](../decisions/002-iteron-cli-commands.md) must be approved
- Podman 4.0+ availability on target platforms (macOS, Linux, Windows-WSL2)
- API keys or subscription accounts for agent providers (Anthropic, OpenAI, Google)

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Claude Code memory leak exceeds 16 GB | Container OOM, killed | Memory limits (16 GB), container auto-restart policy, monitoring |
| Podman machine overhead on macOS/Windows | High idle resource usage | Helper scripts to stop machine when idle, document manual lifecycle |
| Agent runtime conflicts (future updates) | Build failures, incompatibility | Pin Node.js LTS version, test before image updates, version lock agents |
| Workspace name collisions | Data confusion between projects | Document naming conventions, `iteron ls` shows all workspaces |

## Future Work

- **AWS deployment** — Fargate + EFS for long-running autonomous tasks in cloud
- **Apple Containerization framework** (WWDC 2025) — evaluate for macOS-native sandboxing without Podman VM overhead
- **Agent-specific resource limits** — per-agent memory/CPU cgroups within container
- **Multi-agent task orchestration** — workflow engine for coordinated autonomous tasks
- **Observability** — structured logging, distributed tracing per agent
- **CI/CD integration** — automated OCI image builds, vulnerability scanning, regression tests
