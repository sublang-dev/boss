<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Agent Configuration

## Supported Agents

| Agent Name | Binary | Provider | Subscription Auth | API Key Env Var |
| --- | --- | --- | --- | --- |
| `claude-code` | `claude` | Anthropic | `setup-token` | `ANTHROPIC_API_KEY` |
| `codex-cli` | `codex` | OpenAI | `codex login --device-auth` | `CODEX_API_KEY` |
| `gemini-cli` | `gemini` | Google | `NO_BROWSER` PKCE OAuth | `GEMINI_API_KEY` |
| `opencode` | `opencode` | OpenCode | Credential forwarding | `MOONSHOT_API_KEY` |

Agent-to-binary mappings are defined in `~/.iteron/config.toml`:

```toml
[agents.claude-code]
binary = "claude"

[agents.codex-cli]
binary = "codex"

[agents.gemini-cli]
binary = "gemini"

[agents.opencode]
binary = "opencode"
```

## Authentication

IterOn supports two auth strategies: **subscription auth** (primary) and **API keys** (fallback). Subscription auth uses your existing Pro/Max/Teams/Enterprise plan without separate API billing.

### Claude Code

**Subscription auth (recommended):** Generate a setup token on a machine with a browser:

```bash
# On your host machine (not in the container)
claude setup-token
```

This produces a long-lived OAuth token (~1 year). Add it to `~/.iteron/.env`:

```
CLAUDE_CODE_OAUTH_TOKEN=<token>
```

**API key fallback:**

```
ANTHROPIC_API_KEY=sk-ant-...
```

**Dynamic key retrieval:** Claude Code supports `apiKeyHelper` — a script that returns fresh keys on each invocation. Set `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` to control the refresh interval. Do not use `apiKeyHelper` together with `CLAUDE_CODE_OAUTH_TOKEN`.

### Codex CLI

**Subscription auth (recommended):** Run the device-code flow inside the container:

```bash
iteron open codex-cli
# In the tmux session:
codex login --device-auth
```

The CLI displays a URL and one-time code. Open the URL in any browser to complete auth. Teams/Enterprise admins must enable device-code auth in their organization settings.

**API key fallback** (`codex exec` only):

```
CODEX_API_KEY=sk-...
```

### Gemini CLI

**Subscription auth (recommended):** The `NO_BROWSER=true` environment variable (set in the sandbox image) triggers a PKCE OAuth flow:

```bash
iteron open gemini-cli
# Gemini prints an auth URL; open it in your browser
# Paste the authorization code back into the terminal
```

**API key fallback:**

```
GEMINI_API_KEY=AIza...
```

Google Cloud service accounts via Vertex AI are an alternative for enterprise deployments.

### OpenCode

**Credential forwarding (recommended):** If `~/.local/share/opencode/auth.json` exists on the host, `iteron start` forwards it into the container automatically.

**API key fallback:**

```
MOONSHOT_API_KEY=...
```

## Autonomy Configuration

The sandbox image includes pre-configured settings that allow agents to run autonomously without permission prompts:

| Agent | Config File | Key Settings |
| --- | --- | --- |
| Claude Code | `~/.claude.json` | `hasCompletedOnboarding: true` |
| Claude Code | `~/.claude/settings.json` | All tool permissions allowed |
| Codex CLI | `~/.codex/config.toml` | `approval_policy = "never"`, `sandbox_mode = "danger-full-access"` |
| Gemini CLI | `~/.gemini/settings.json` | `approvalMode: "auto_edit"` |
| OpenCode | `~/.config/opencode/opencode.json` | All permissions allowed |

These configs are baked into the image. Since `/home/iteron` is backed by the `iteron-data` volume, agents can modify their own config files and changes persist across container restarts.

## Environment Variables

All env vars in `~/.iteron/.env` are loaded into the container on `iteron start`. The full template:

```bash
# Claude Code (run `claude setup-token` on host)
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

See also: [Troubleshooting](troubleshooting.md) for auth failure debugging.
