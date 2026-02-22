<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2025 SubLang International <https://sublang.ai> -->

# <img src="assets/boss.svg" alt="boss" width="128" height="128">

[![npm version](https://img.shields.io/npm/v/@sublang/boss)](https://www.npmjs.com/package/@sublang/boss)
[![Node.js](https://img.shields.io/node/v/@sublang/boss)](https://nodejs.org/)
[![CI](https://github.com/sublang-dev/boss/actions/workflows/ci.yml/badge.svg)](https://github.com/sublang-dev/boss/actions/workflows/ci.yml)

Delegate dev loops to Claude Code, Codex CLI, Gemini CLI, OpenCode or any AI coder. Runs autonomously for hours in an isolated Podman sandbox. Subscription/device auth is primary; API keys are supported fallback.

## Quick Start

Pick the path that fits your setup:

- **Spec Scaffolding** — Start with structured specs to guide AI coding agents.
- **Sandbox** — You want to run AI agents in an isolated Podman container.

### Spec Scaffolding

Scaffold [GEARS](https://sublang.ai/ref/gears-ai-ready-spec-syntax) specs into any project and let AI agents iterate on them:

```bash
npm install -g @sublang/boss
cd your-project
boss scaffold
```

Review the sample iteration `specs/iterations/000-spdx-headers.md`, update the copyright text, then prompt your AI coding agent:

```text
Complete Iteration #0
```

### Sandbox

Install Boss globally to launch AI agents in an isolated Podman container.

#### Prerequisites

- Node.js >= 18
- Podman (installed automatically by `boss init`, or install manually)
- One auth method for the agent(s) you use: subscription/device auth (recommended) or API key fallback

#### Setup

```bash
# Install Boss globally
npm install -g @sublang/boss

# Initialize Podman, pull sandbox image, create config
boss init

# Optional fallback API keys
# Edit ~/.boss/.env if you prefer key-based auth
```

#### Run

```bash
# Start the sandbox container
boss start

# Open Claude Code in a workspace
boss open myproject claude

# Open Claude Code with extra args
boss open myproject claude -- --resume

# List running sessions
boss ls

# More features
boss -h
```

Then authenticate in-session (recommended), or set fallback API keys in `~/.boss/.env`.

If any step fails, see [Troubleshooting](docs/troubleshooting.md).

#### Supported Agents

Built-in (no configuration needed):

| Agent Name | Binary | Provider | Primary Auth | Fallback Env Var |
| --- | --- | --- | --- | --- |
| `claude` | `claude` | Anthropic | `claude setup-token` | `ANTHROPIC_API_KEY` |
| `codex` | `codex` | OpenAI | `codex login --device-auth` | `CODEX_API_KEY` |
| `gemini` | `gemini` | Google | `NO_BROWSER` OAuth flow | `GEMINI_API_KEY` |
| `opencode` | `opencode` | OpenCode | Host credential forwarding | `MOONSHOT_API_KEY` |

For full auth details and caveats, see [Agent Configuration](docs/agents.md).

#### Configuration

| File | Purpose |
| --- | --- |
| `~/.boss/config.toml` | Container settings, [SSH keys](docs/agents.md#ssh-keys) |
| `~/.boss/.env` | Auth env vars (subscription tokens and API-key fallbacks; loaded on `start`) |

## Workflow

<img src="assets/workflow.png" alt="Boss Workflow" width="530" height="510" style="max-width: 100%; height: auto">

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

- 🌟 Star our repo if you find Boss useful.
- [Open an issue](https://github.com/sublang-dev/boss/issues) for bugs or feature requests.
- [Open a PR](https://github.com/sublang-dev/boss/pulls) for fixes or improvements.
- Discuss on [Discord](https://discord.gg/cxUsykWr) for support or new ideas.
