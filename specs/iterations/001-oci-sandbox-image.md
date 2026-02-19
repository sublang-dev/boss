<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-001: OCI Sandbox Image

## Goal

Build a multi-arch OCI container image that packages all four agent runtimes (Claude Code, Codex CLI, Gemini CLI, OpenCode) with tini, tmux, agent autonomy defaults, and security-hardened filesystem layout on `node:22-bookworm-slim`.

## Deliverables

- [x] Dockerfile based on `node:22-bookworm-slim`
- [x] Multi-arch build script (`linux/amd64`, `linux/arm64`)
- [x] All four agent runtimes installed and invocable
- [x] Canonical agent-name-to-binary mapping
- [x] tini as PID 1, tmux for session management
- [x] Non-root user `iteron` (UID 1000) with read-only-compatible layout
- [x] Agent autonomy defaults (full permissions, no interactive approval prompts)
- [x] Default tmux configuration

## Tasks

### 1. Dockerfile: base image and utilities

- Base: `node:22-bookworm-slim` (Debian Bookworm, ~30 MB) per [DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)
- Install system packages: `tini`, `tmux`, `bash`, `git`, `curl`, `jq`, `locales`
- Generate `en_US.UTF-8` locale; set `LANG` and `LC_ALL` to `en_US.UTF-8`
- Create non-root user `iteron` (UID 1000, GID 1000, home `/home/iteron`)
- Set `ENTRYPOINT ["/usr/bin/tini", "--"]` and `CMD ["bash"]`
- Set `USER iteron` and `WORKDIR /home/iteron`

### 2. Agent runtime installation and name mapping

Install each agent and verify its binary is on `PATH`:

- Claude Code: `npm install -g @anthropic-ai/claude-code`
- Codex CLI: standalone musl binary from GitHub releases (avoids 400 MB npm multi-platform bundle)
- Gemini CLI: `npm install -g @google/gemini-cli`
- OpenCode: `npm install -g opencode-ai`

**Agent name mapping** — [DR-002](../decisions/002-iteron-cli-commands.md#workspace-model) defines reserved agent names for `iteron open` and tmux session naming. These map to binary commands as follows:

| Agent name (config / CLI) | Binary command | Source |
| --- | --- | --- |
| `claude` | `claude` | npm: `@anthropic-ai/claude-code` |
| `codex` | `codex` | GitHub releases (standalone musl binary) |
| `gemini` | `gemini` | npm: `@google/gemini-cli` |
| `opencode` | `opencode` | npm: `opencode-ai` |

`iteron open myproject claude` resolves to binary `claude` and creates tmux session `claude@myproject`. Verify exact binary names during implementation — upstream projects may change them.

### 3. Multi-arch build

- Use `podman manifest` or `docker buildx` for multi-platform builds
- Target: `linux/amd64`, `linux/arm64` (Graviton + Apple Silicon)
- Tag convention: `ghcr.io/sublang-dev/iteron-sandbox:<version>`
- Build script: `scripts/build-image.sh` wrapping the multi-arch build

### 4. Filesystem layout for security

- Read-only-compatible root: no agent writes outside `/tmp` and `/home/iteron`
- Remove SUID/SGID binaries in image (`RUN find / -perm /6000 -exec chmod a-s {} +`)
- Writable paths at runtime: `/tmp` (tmpfs), `/home/iteron` (volume mount)

### 5. Agent autonomy configuration

Per [DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary): "Agents run with full permissions *inside* the container." Pre-configure each agent to auto-approve all actions so the container boundary is the only security layer:

- **Claude Code**: configure `~/.claude/settings.json` to allow all tool invocations without prompting; set `hasCompletedOnboarding: true` in `~/.claude.json` to bypass first-run
- **Codex CLI**: configure for `full-auto` approval mode (no human approval on file writes or shell commands)
- **Gemini CLI**: configure sandbox/permission settings for fully autonomous operation
- **OpenCode**: configure to auto-approve all tool invocations

These defaults live in the image so every container launch is autonomous out of the box. Users who attach via `iteron open` give the initial task/prompt; the agent then executes without further permission requests. Exact config format per agent should be verified against current agent documentation during implementation.

### 6. tmux default configuration

- Place `/etc/tmux.conf` with:
  - 10,000-line scrollback history
  - Status bar showing session name and time
  - Mouse mode off by default (toggleable with `Ctrl-B m`, persisted across restarts)
  - `set -g default-terminal "tmux-256color"`

## Verification

| # | Test | Expected |
| --- | --- | --- |
| 1 | `podman build --platform linux/amd64` | Exit 0, image tagged |
| 2 | `podman build --platform linux/arm64` | Exit 0, image tagged |
| 3 | `podman run --rm <image> claude --version` | Exit 0, prints version string |
| 4 | `podman run --rm <image> codex --version` | Exit 0, prints version string |
| 5 | `podman run --rm <image> gemini --version` | Exit 0, prints version string |
| 6 | `podman run --rm <image> opencode --version` | Exit 0, prints version string |
| 7 | `podman run --rm <image> tini --version` | Exit 0, prints version string |
| 8 | `podman run --rm <image> tmux -V` | Exit 0, prints `tmux 3.x` |
| 9 | `podman run --rm <image> id` | `uid=1000(iteron) gid=1000(iteron)` |
| 10 | `podman run --rm --read-only <image> touch /usr/local/test` | Exit 1, `Read-only file system` |
| 11 | `podman run --rm --read-only --tmpfs /tmp <image> touch /tmp/test` | Exit 0 |
| 12 | `podman run --rm <image> cat /home/iteron/.claude.json` | JSON containing `"hasCompletedOnboarding": true` |
| 13 | `podman run --rm <image> cat /home/iteron/.claude/settings.json` | JSON with tool-allow-all permission config |
| 14 | `podman run --rm <image> find / -perm /6000 -type f 2>/dev/null \| wc -l` | `0` (no SUID/SGID binaries) |
| 15 | `podman image inspect <image> --format '{{.Size}}'` | < 1 GB compressed |

## Dependencies

- [DR-001](../decisions/001-sandbox-architecture.md) approved
- Podman 4.0+ installed locally (for manual build/test)
