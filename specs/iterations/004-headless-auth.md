<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai> -->

# IR-004: Headless Authentication

## Goal

Configure API key injection and headless authentication so all four agents start without interactive prompts (login, onboarding, permission dialogs) inside the sandbox container.

## Deliverables

- [ ] Claude Code headless configuration (`hasCompletedOnboarding`, API key, permission bypass)
- [ ] Codex CLI API key injection (`CODEX_API_KEY` for `codex exec`)
- [ ] Gemini CLI API key injection (`GEMINI_API_KEY`)
- [ ] OpenCode API key injection
- [ ] Documentation of subscription auth flows (device-auth, service accounts) as alternatives

## Tasks

### 1. Claude Code headless authentication

Per [DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication):

- Verify `~/.claude.json` with `hasCompletedOnboarding: true` is present in image (from [IR-001 §5](001-oci-sandbox-image.md#5-agent-autonomy-configuration))
- Inject `ANTHROPIC_API_KEY` via `~/.iteron/.env` (loaded by `iteron start` per [IR-002 §3](002-container-lifecycle.md#3-iteron-start))
- Document `apiKeyHelper` configuration for dynamic key retrieval
- Document `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` for key caching

### 2. Codex CLI headless authentication

- Inject `CODEX_API_KEY` via `~/.iteron/.env` (for `codex exec` non-interactive mode)
- Document `codex login --device-auth` flow for subscription users as an alternative
- Note: `CODEX_API_KEY` is `codex exec` only per [DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)

### 3. Gemini CLI headless authentication

- Inject `GEMINI_API_KEY` via `~/.iteron/.env`
- Document Google Cloud service account setup for non-interactive auth as an alternative

### 4. OpenCode authentication

- Inject provider API key (typically `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) via `~/.iteron/.env`
- Document which provider keys OpenCode accepts

## Verification

Each test runs in a freshly started container (`iteron stop && iteron start`) with the corresponding API key set in `~/.iteron/.env`.

| # | Test | Expected |
| --- | --- | --- |
| 1 | Set valid `ANTHROPIC_API_KEY` in `.env`; `iteron open claude-code`; type `hello` at the prompt | Agent responds (no onboarding wizard, no "enter API key" prompt). Detach. |
| 2 | Set valid `ANTHROPIC_API_KEY` in `.env`; `podman exec iteron-sandbox claude -p "echo hello" --output-format json` | Exit 0; stdout contains JSON with `"result"` field |
| 3 | Set empty `ANTHROPIC_API_KEY=` in `.env`; `podman exec iteron-sandbox claude -p "echo hello"` | Exit non-zero; stderr contains authentication error (not an onboarding prompt) |
| 4 | Set valid `CODEX_API_KEY` in `.env`; `podman exec iteron-sandbox codex exec "echo hello world"` | Exit 0; produces output (not a login prompt) |
| 5 | Set valid `GEMINI_API_KEY` in `.env`; `podman exec iteron-sandbox gemini -p "echo hello"` (verify exact non-interactive flag during implementation) | Exit 0; stdout contains agent response (not a "sign in with Google" prompt) |
| 6 | Set valid provider key in `.env`; `podman exec iteron-sandbox opencode -p "echo hello"` (verify exact non-interactive flag during implementation) | Exit 0; stdout contains agent response (not an auth prompt) |
| 7 | `podman exec iteron-sandbox printenv ANTHROPIC_API_KEY` | Matches value from `.env` (key injection works) |
| 8 | `podman exec iteron-sandbox cat ~/.claude.json \| jq .hasCompletedOnboarding` | `true` |

## Non-Goals

- Credential-injecting proxy (LiteLLM/Envoy) — deferred to cloud deployment
- Dynamic key rotation or Vault integration
- Agent compatibility / coding task validation — see [IR-005](005-autonomous-execution.md)

## Dependencies

- [IR-001](001-oci-sandbox-image.md) (autonomy defaults baked into image)
- [IR-002](002-container-lifecycle.md) (`.env` loading via `iteron start`)
- [IR-003](003-workspace-interaction.md) (`iteron open` for interactive verification)
- [DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication) approved
- Valid API keys for Anthropic, OpenAI, and Google (test accounts)
