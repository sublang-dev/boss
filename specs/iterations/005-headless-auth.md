<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-005: Headless Authentication

## Goal

Configure subscription-based authentication as the primary headless auth path, with API key injection as the fallback, so all four agents start without interactive prompts (login, onboarding, permission dialogs) inside the sandbox container.

## Deliverables

- [x] Claude Code subscription auth (`CLAUDE_CODE_OAUTH_TOKEN` via `setup-token`)
- [x] Codex CLI subscription auth (`codex login --device-auth`)
- [x] Gemini CLI subscription auth (`NO_BROWSER=true` PKCE OAuth flow)
- [x] OpenCode auth (credential forwarding or provider env vars)
- [x] API key fallback for Claude Code, Codex CLI, and Gemini CLI
- [x] `hasCompletedOnboarding` bypass for Claude Code

## Tasks

### 1. Claude Code authentication

Per [DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication):

**Subscription (primary):**

- Support `CLAUDE_CODE_OAUTH_TOKEN` env var in `~/.boss/.env` (loaded by `boss start` per [IR-002 §3](002-container-lifecycle.md#3-boss-start))
- Document one-time `claude setup-token` step on a host with a browser; token valid ~1 year \[1]
- Document that `CLAUDE_CODE_OAUTH_TOKEN` must not coexist with `apiKeyHelper` \[2]

**Fallback:**

- Inject `ANTHROPIC_API_KEY` via `~/.boss/.env`

**Onboarding bypass:**

- Verify `~/.claude.json` with `hasCompletedOnboarding: true` is present in image (from [IR-001 §5](001-oci-sandbox-image.md#5-agent-autonomy-configuration)) \[3]

> **Why not credential forwarding?** macOS stores OAuth tokens in Keychain rather than on disk \[2]\[4]; copied credentials stop working after access-token expiry (known issue \[5]). `setup-token` avoids both problems.

### 2. Codex CLI authentication

**Subscription (primary):**

- Support `codex login --device-auth` inside the container via tmux \[6] — displays URL and one-time code; user completes auth on any browser
- Document that Teams/Enterprise workspace admins must enable device-code auth \[6]

**Fallback:**

- Inject `CODEX_API_KEY` via `~/.boss/.env` (for `codex exec` non-interactive mode only) \[7]

> **Alternative: credential forwarding.** Copying `auth.json` into containers is officially documented \[6] but requires `cli_auth_credentials_store = "file"` on macOS (default `auto` uses Keychain) \[8] and risks token desync on concurrent host/container use.

### 3. Gemini CLI authentication

**Subscription (primary):**

- Set `NO_BROWSER=true` in container environment; the CLI prints an OAuth URL for the user to open on any browser and paste back the authorization code \[9]
- Works through Boss's tmux interaction
- Caveat: this env var is referenced in CLI error messages but not yet in official auth guides \[9]; a v0.18.0 regression was fixed in v0.18.4 \[10]

**Fallback:**

- Inject `GEMINI_API_KEY` via `~/.boss/.env` \[9]

**Enterprise alternative:**

- Document Google Cloud service account setup (`GOOGLE_APPLICATION_CREDENTIALS`) for Vertex AI \[9]

### 4. OpenCode authentication

**Primary:**

- Support credential forwarding: `boss start` bind-mounts host `~/.local/share/opencode/auth.json` into the container if it exists (file-based, no Keychain \[11]; path is `~/.local/share/` on all platforms via `xdg-basedir` \[12])
- Mount read-write for token refresh; add `:U` suffix for rootless Podman UID mapping

**Fallback:**

- Inject provider env var (e.g. `ANTHROPIC_API_KEY`) via `~/.boss/.env` \[13]

## Verification

Each test runs in a freshly started container (`boss stop && boss start`).

| # | Test | Expected |
| --- | --- | --- |
| 1 | Set `CLAUDE_CODE_OAUTH_TOKEN` in `.env`; `boss open claude`; send `hello` | Agent responds without login or onboarding prompt |
| 2 | Set `ANTHROPIC_API_KEY` in `.env` (no OAuth token); `podman exec boss-sandbox claude -p "echo hello"` | Exit 0 (API key fallback works) |
| 3 | No auth in `.env`; `podman exec boss-sandbox claude -p "echo hello"` | Exit non-zero; stderr shows auth error, not onboarding |
| 4 | `boss open codex`; run `codex login --device-auth` | CLI displays device URL and code; login succeeds after browser auth |
| 5 | Set `CODEX_API_KEY` in `.env`; `podman exec boss-sandbox codex exec "echo hello"` | Exit 0 |
| 6 | `boss open gemini` (with `NO_BROWSER=true`); run `gemini` | CLI prints auth URL; after browser auth and code paste, agent responds |
| 7 | Set `GEMINI_API_KEY` in `.env`; `podman exec boss-sandbox gemini -p "echo hello"` | Exit 0 (API key fallback) |
| 8 | Mount host `auth.json`; `podman exec boss-sandbox opencode run "echo hello"` | Exit 0; uses forwarded credentials |
| 9 | `podman exec boss-sandbox cat ~/.claude.json \| jq .hasCompletedOnboarding` | `true` |

## References

1. Claude Code `setup-token` (official) — <https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md>
2. Claude Code authentication (official) — <https://code.claude.com/docs/en/authentication>
3. Claude Code `hasCompletedOnboarding`, GitHub #4714 — <https://github.com/anthropics/claude-code/issues/4714>
4. Claude Code macOS Keychain storage, GitHub #10039 — <https://github.com/anthropics/claude-code/issues/10039>
5. Claude Code token refresh on copy, GitHub #21765 — <https://github.com/anthropics/claude-code/issues/21765>
6. Codex CLI authentication (official) — <https://developers.openai.com/codex/auth/>
7. Codex CLI non-interactive mode (official) — <https://developers.openai.com/codex/noninteractive/>
8. Codex CLI config reference (official) — <https://developers.openai.com/codex/config-reference/>
9. Gemini CLI authentication (official) — <https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.md>
10. Gemini CLI `NO_BROWSER` regression fixed in v0.18.4, GitHub #13853 — <https://github.com/google-gemini/gemini-cli/issues/13853>
11. OpenCode file-based credential storage, GitHub #4318 — <https://github.com/sst/opencode/issues/4318>
12. OpenCode uses `xdg-basedir` on all platforms — <https://github.com/sst/opencode/blob/dev/packages/opencode/src/global/index.ts>
13. OpenCode provider configuration (official) — <https://opencode.ai/docs/providers/>

## Dependencies

- [IR-001](001-oci-sandbox-image.md) (autonomy defaults baked into image)
- [IR-002](002-container-lifecycle.md) (`.env` loading and volume mounts via `boss start`)
- [IR-004](004-workspace-interaction.md) (`boss open` for interactive verification)
- [DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication) approved
- Valid subscriptions or API keys for Anthropic, OpenAI, and Google (test accounts)
