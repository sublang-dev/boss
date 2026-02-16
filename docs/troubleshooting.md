<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Troubleshooting

## Podman Not Installed

**Symptom:** `iteron init` reports that Podman is not found.

**Fix:** Let `iteron init` install it for you (it will prompt), or install manually:

- **macOS:** `brew install podman`
- **Fedora/RHEL:** `sudo dnf install podman`
- **Ubuntu/Debian:** `sudo apt install podman`
- **WSL2 (Ubuntu):** `sudo apt install podman`

Then re-run `iteron init`.

## Podman Machine Not Running (macOS)

**Symptom:** `iteron start` fails with a connection error on macOS.

**Fix:** Start the Podman machine:

```bash
podman machine start
```

Or re-run `iteron init` which handles machine initialization automatically.

## Container Not Running

**Symptom:** `iteron open` exits with "Container iteron-sandbox is not running. Run `iteron start` first."

**Fix:**

```bash
iteron start
```

## OOM / Memory Issues

**Symptom:** The container is killed or becomes unresponsive during a long agent run.

**Cause:** The sandbox runs with a 16 GB memory limit (`--memory 16g`). Some agents (especially Claude Code) can consume significant memory during extended sessions.

**Fix:**

1. Restart the container — workspace data is preserved on the volume:
   ```bash
   iteron stop
   iteron start
   ```
2. Check memory usage:
   ```bash
   podman stats --no-stream iteron-sandbox
   ```
3. If 16 GB is insufficient, edit `~/.iteron/config.toml`:
   ```toml
   [container]
   memory = "32g"
   ```
   Then restart: `iteron stop && iteron start`.

## Authentication Failures

### Claude Code

**Symptom:** Claude Code prompts for login or shows "unauthorized".

**Fix:**
1. Verify `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` is set in `~/.iteron/.env`
2. Regenerate the setup token if expired:
   ```bash
   # On your host machine
   claude setup-token
   ```
3. Restart the container to reload env vars: `iteron stop && iteron start`

### Codex CLI

**Symptom:** Codex CLI shows authentication errors.

**Fix:**
1. Run the device-code flow inside the container:
   ```bash
   iteron open codex
   codex login --device-auth
   ```
2. Or set `CODEX_API_KEY` in `~/.iteron/.env` (works with `codex exec` only)
3. For Teams/Enterprise: ensure your admin has enabled device-code auth

### Gemini CLI

**Symptom:** Gemini CLI fails to authenticate or the `NO_BROWSER` flow doesn't work.

**Fix:**
1. Open Gemini and complete the PKCE flow:
   ```bash
   iteron open gemini
   # Follow the URL printed by Gemini, paste the code back
   ```
2. Or set `GEMINI_API_KEY` in `~/.iteron/.env`
3. Ensure you're using Gemini CLI >= v0.18.4 (earlier versions had a `NO_BROWSER` regression)

### OpenCode

**Symptom:** OpenCode shows provider authentication errors.

**Fix:**
1. Ensure `~/.local/share/opencode/auth.json` exists on your host — `iteron start` forwards it automatically
2. Or set `MOONSHOT_API_KEY` in `~/.iteron/.env`

## Agent Permission Prompts Appearing

**Symptom:** An agent asks for permission to run tools, edit files, or execute commands instead of running autonomously.

**Cause:** The autonomy config files in the container may have been overwritten or corrupted.

**Fix:**

1. Check that the config files exist:
   ```bash
   iteron open
   # Inside the container:
   cat ~/.claude.json              # Should have hasCompletedOnboarding: true
   cat ~/.claude/settings.json     # Should list allowed permissions
   cat ~/.codex/config.toml        # Should have approval_policy = "never"
   cat ~/.gemini/settings.json     # Should have approvalMode: "auto_edit"
   ```
2. If missing or corrupted, recreate the container to restore image defaults:
   ```bash
   iteron stop
   podman volume rm iteron-data    # WARNING: deletes all workspace data
   iteron start
   ```
   Back up important workspace data before removing the volume.

## Read-Only Filesystem Errors

**Symptom:** Commands inside the container fail with "Read-only file system".

**Cause:** The sandbox runs with `--read-only` for security. Only `/tmp` and `/home/iteron` are writable.

**Fix:**
- Write files to `/home/iteron/` (your home directory) or `/tmp`
- Install binaries to `~/.local/bin` (on PATH and persistent)
- System paths like `/usr`, `/etc`, `/var` are intentionally read-only

## Image Pull Failures

**Symptom:** `iteron init` fails to pull the sandbox image.

**Fix:**
1. Check internet connectivity
2. Verify you can reach the registry:
   ```bash
   podman pull ghcr.io/sublang-dev/iteron-sandbox:latest
   ```
3. If behind a proxy, configure Podman's proxy settings:
   ```bash
   # ~/.config/containers/containers.conf
   [engine]
   env = ["HTTP_PROXY=http://proxy:8080", "HTTPS_PROXY=http://proxy:8080"]
   ```
