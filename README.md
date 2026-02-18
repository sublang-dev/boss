<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2025 SubLang International <https://sublang.ai> -->

# <img src="assets/iteron.svg" alt="iteron" width="128" height="128">

[![npm version](https://img.shields.io/npm/v/@sublang/iteron)](https://www.npmjs.com/package/@sublang/iteron)
[![Node.js](https://img.shields.io/node/v/@sublang/iteron)](https://nodejs.org/)
[![CI](https://github.com/sublang-dev/iteron/actions/workflows/ci.yml/badge.svg)](https://github.com/sublang-dev/iteron/actions/workflows/ci.yml)

Delegate dev loops to Claude Code, Codex CLI, OpenCode or any AI coder. Runs autonomously for hours. No costly API keys.

> **Status:**
>
> - [x] Stage 1 — Spec scaffolding (`iteron scaffold`)
> - [x] Stage 2 — OCI sandbox image with Claude Code, Codex CLI, Gemini CLI, OpenCode
> - [x] Stage 3 — Container lifecycle (`iteron init`, `start`, `stop`)
> - [x] Stage 4 — Workspace interaction (`iteron open`, `ls`, `rm`)
> - [ ] Stage 5 — Headless authentication  — in progress

## Quick Start

Pick the path that fits your setup:

- **Spec Scaffolding** — Start with structured specs to guide AI coding agents.
- **Sandbox** — You want to run AI agents in an isolated Podman container.

### Spec Scaffolding

Scaffold [GEARS](https://sublang.ai/ref/gears-ai-ready-spec-syntax) specs into any project and let AI agents iterate on them:

```bash
npm install -g @sublang/iteron
cd your-project
iteron scaffold
```

Review the sample iteration `specs/iterations/000-spdx-headers.md`, update the copyright text, then prompt your AI coding agent:

```text
Complete Iteration #0
```

### Sandbox

Install IterOn globally to launch AI agents in an isolated Podman container.

#### Prerequisites

- Node.js >= 18
- Podman (installed automatically by `iteron init`, or install manually)
- At least one API key (`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, or `GEMINI_API_KEY`)

#### Setup

```bash
# Install IterOn globally
npm install -g @sublang/iteron

# Initialize Podman, pull sandbox image, create config
iteron init

# Add your API keys
# Edit ~/.iteron/.env and fill in at least one key
```

#### Run

```bash
# Start the sandbox container
iteron start

# Open Claude Code in a workspace
iteron open myproject claude

# Open Claude Code with extra args
iteron open myproject claude -- --resume

# List running sessions
iteron ls

# More features
iteron -h
```

#### Supported Agents

Built-in (no configuration needed):

| Agent Name | Binary | Provider |
| --- | --- | --- |
| `claude` | `claude` | Anthropic |
| `codex` | `codex` | OpenAI |
| `gemini` | `gemini` | Google |
| `opencode` | `opencode` | OpenCode |

#### Configuration

| File | Purpose |
| --- | --- |
| `~/.iteron/config.toml` | Container settings, [SSH keys](docs/agents.md#ssh-keys) |
| `~/.iteron/.env` | API keys (loaded into container on `start`) |

## Workflow

<img src="assets/workflow.png" alt="IterOn Workflow" width="530" height="510" style="max-width: 100%; height: auto">

1. **Make Decisions** — Discuss requirements and architecture with AI. It generates decision records in `specs/decisions/`.
2. **Plan Iterations** — Break down work into iteration specs with AI. It generates iteration records in `specs/iterations/`.
3. **AI Executes** — Let AI agents complete the tasks autonomously. They generate code and update `specs/`.

Then loop back to the next decision or iteration.

## Documentation

- [Installation Guide](docs/install.md) — prerequisites, setup, platform notes
- [CLI Reference](docs/cli-reference.md) — all 7 commands with options, examples, and exit codes
- [Agent Configuration](docs/agents.md) — authentication, autonomy settings, API keys
- [Workspace Guide](docs/workspaces.md) — creating, listing, and removing workspaces
- [Tmux Quick Reference](docs/tmux.md) — detach, reattach, pane splits, scrollback
- [Troubleshooting](docs/troubleshooting.md) — common issues and fixes

## Contributing

We welcome contributions of all kinds. If you'd like to help:

- 🌟 Star our repo if you find IterOn useful.
- [Open an issue](https://github.com/sublang-dev/iteron/issues) for bugs or feature requests.
- [Open a PR](https://github.com/sublang-dev/iteron/pulls) for fixes or improvements.
- Discuss on [Discord](https://discord.gg/cxUsykWr) for support or new ideas.
