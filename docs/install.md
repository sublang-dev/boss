<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Installation Guide

## Prerequisites

- **Node.js** >= 18 ([download](https://nodejs.org/))
- **Podman** (installed automatically by `boss init`, or [install manually](https://podman.io/docs/installation))
- At least one API key or subscription for a supported agent

## Install Boss

```bash
npm install -g @sublang/boss
```

Verify the installation:

```bash
boss -V
# 0.1.2
```

## Initialize the Sandbox

```bash
boss init
```

`boss init` performs these steps automatically:

1. **Detects your platform** (macOS, Linux, or WSL2)
2. **Installs Podman** if not found (prompts for confirmation)
3. **Initializes and starts the Podman machine** (macOS only)
4. **Verifies rootless mode** — refuses to proceed if Podman runs as root
5. **Pulls the sandbox image** (`ghcr.io/sublang-dev/boss-sandbox:latest`)
6. **Creates the `boss-data` volume** for persistent workspace storage
7. **Generates config** at `~/.boss/config.toml`
8. **Generates env template** at `~/.boss/.env`

Expected output (on macOS with Podman already installed):

```
Detected platform: darwin/arm64
  Podman installed (skipped)
  Podman machine init (skipped)
  Podman machine start (skipped)
  Rootless mode (done)
  Image ghcr.io/sublang-dev/boss-sandbox:latest (done)
  Volume "boss-data" (created)
  Config ~/.boss/config.toml (created)
  Env template ~/.boss/.env (created)

Initialization complete.
```

### Options

| Flag | Description |
| --- | --- |
| `--image <url>` | Use a custom OCI image instead of the default |
| `-y, --yes` | Skip confirmation prompts |

## Set Up API Keys

Edit `~/.boss/.env` and fill in at least one key:

```bash
# Claude Code (run `claude setup-token` on host for subscription auth)
CLAUDE_CODE_OAUTH_TOKEN=
# Claude Code fallback
ANTHROPIC_API_KEY=

# Codex CLI fallback (primary: `codex login --device-auth` in container)
CODEX_API_KEY=

# Gemini CLI fallback (primary: NO_BROWSER OAuth in container)
GEMINI_API_KEY=

# OpenCode / Kimi K2 (Moonshot AI)
MOONSHOT_API_KEY=
```

See [Agent Configuration](agents.md) for subscription auth alternatives that don't require API keys.

## Platform Notes

### macOS

Podman runs inside a lightweight Linux VM managed by `podman machine`. `boss init` creates and starts this machine automatically with 4 GB RAM and 2 vCPUs.

### Linux

Podman runs natively in rootless mode. No VM is required. Install Podman via your distribution's package manager if `boss init` does not detect it.

### WSL2

Run Boss inside a WSL2 distribution (Ubuntu recommended). Podman runs natively inside WSL2, same as Linux. Do not use Podman Desktop for Windows — use the WSL2 package instead.

## Next Steps

- [CLI Reference](cli-reference.md) — all commands and options
- [Workspace Guide](workspaces.md) — creating and managing workspaces
- [Agent Configuration](agents.md) — authentication and agent setup
