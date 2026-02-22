<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Troubleshooting

## Podman Not Installed

**Symptom:** `boss init` reports that Podman is not found.

**Fix:** Let `boss init` install it for you (it will prompt), or install manually:

- **macOS:** `brew install podman`
- **Fedora/RHEL:** `sudo dnf install podman`
- **Ubuntu/Debian:** `sudo apt install podman`
- **WSL2 (Ubuntu):** `sudo apt install podman`

Then re-run `boss init`.

## Podman Machine Not Running (macOS)

**Symptom:** `boss start` fails with a connection error on macOS.

**Fix:** Start the Podman machine:

```bash
podman machine start
```

Or re-run `boss init` which handles machine initialization automatically.

## Container Not Running

**Symptom:** `boss open` exits with "Container boss-sandbox is not running. Run `boss start` first."

**Fix:**

```bash
boss start
```

## OOM / Memory Issues

**Symptom:** The container is killed or becomes unresponsive during a long agent run.

**Cause:** The sandbox runs with a 16 GB memory limit (`--memory 16g`). Some agents (especially Claude Code) can consume significant memory during extended sessions.

**Fix:**

1. Restart the container — workspace data is preserved on the volume:
   ```bash
   boss stop
   boss start
   ```
2. Check memory usage:
   ```bash
   podman stats --no-stream boss-sandbox
   ```
3. If 16 GB is insufficient, edit `~/.boss/config.toml`:
   ```toml
   [container]
   memory = "32g"
   ```
   Then restart: `boss stop && boss start`.

## Authentication Failures

### Claude Code

**Symptom:** Claude Code prompts for login or shows "unauthorized".

**Fix:**
1. Verify `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` is set in `~/.boss/.env`
2. Regenerate the setup token if expired:
   ```bash
   # On your host machine
   claude setup-token
   ```
3. Restart the container to reload env vars: `boss stop && boss start`

### Codex CLI

**Symptom:** Codex CLI shows authentication errors.

**Fix:**
1. Run the device-code flow inside the container:
   ```bash
   boss open ~ codex
   codex login --device-auth
   ```
2. Or set `CODEX_API_KEY` in `~/.boss/.env` (works with `codex exec` only)
3. For Teams/Enterprise: ensure your admin has enabled device-code auth

### Gemini CLI

**Symptom:** Gemini CLI fails to authenticate or the `NO_BROWSER` flow doesn't work.

**Fix:**
1. Open Gemini and complete the PKCE flow:
   ```bash
   boss open ~ gemini
   # Follow the URL printed by Gemini, paste the code back
   ```
2. Or set `GEMINI_API_KEY` in `~/.boss/.env`
3. Ensure you're using Gemini CLI >= v0.18.4 (earlier versions had a `NO_BROWSER` regression)

### OpenCode

**Symptom:** OpenCode shows provider authentication errors.

**Fix:**
1. Ensure `~/.local/share/opencode/auth.json` exists on your host — `boss start` forwards it automatically
2. Or set `MOONSHOT_API_KEY` in `~/.boss/.env`

## Agent Permission Prompts Appearing

**Symptom:** An agent asks for permission to run tools, edit files, or execute commands instead of running autonomously.

**Cause:** The autonomy config files in the container may have been overwritten or corrupted.

**Fix:**

1. Check that the config files exist:
   ```bash
   boss open
   # Inside the container:
   cat ~/.claude.json              # Should have hasCompletedOnboarding: true
   cat ~/.claude/settings.json     # Should list allowed permissions
   cat ~/.codex/config.toml        # Should have approval_policy = "never"
   cat ~/.gemini/settings.json     # Should have approvalMode: "auto_edit"
   ```
2. If missing or corrupted, recreate the container to restore image defaults:
   ```bash
   boss stop
   podman volume rm boss-data    # WARNING: deletes all workspace data
   boss start
   ```
   Back up important workspace data before removing the volume.

## Agent Binary Not Found After Image Upgrade

**Symptom:** `claude`, `codex`, or another agent command is not found after upgrading the sandbox image.

**Cause:** Agent CLIs are managed by mise and preinstalled in the image. `boss start` runs `mise install` to reconcile tools, but the reconciliation may have failed (e.g., network issue during start).

**Fix:**

1. Restart the container — `boss start` will re-run reconciliation:
   ```bash
   boss stop && boss start
   ```
2. Or reconcile manually inside the container:
   ```bash
   boss open
   mise install
   ```
3. As a last resort, recreate the volume for a fresh copy from the image:
   ```bash
   boss stop
   podman volume rm boss-data    # WARNING: deletes all workspace data
   boss start
   ```

## mise Install Slow or Fails During Start

**Symptom:** `boss start` takes a long time or fails with network errors during the `mise install` reconciliation step.

**Cause:** `mise install` downloads tool artifacts from npm and GitHub when they are missing. When tools are already present, this step is typically fast with minimal or no downloads.

**Fix:**

1. Check network connectivity inside the container:
   ```bash
   podman exec boss-sandbox curl -fsSL https://registry.npmjs.org/
   ```
2. If behind a proxy, ensure proxy env vars are set in `~/.boss/.env`
3. If network is unavailable, tools preinstalled in the image are usually already on the volume — reconciliation only downloads when artifacts are missing

## Read-Only Filesystem Errors

**Symptom:** Commands inside the container fail with "Read-only file system".

**Cause:** The sandbox runs with `--read-only` for security. Only `/tmp` and `/home/boss` are writable.

**Fix:**
- Write files to `/home/boss/` (your home directory) or `/tmp`
- Install binaries to `~/.local/bin` (on PATH and persistent)
- System paths like `/usr`, `/etc`, `/var` are intentionally read-only

## Image Pull Failures

**Symptom:** `boss init` fails to pull the sandbox image.

**Fix:**
1. Check internet connectivity
2. Verify you can reach the registry:
   ```bash
   podman pull ghcr.io/sublang-dev/boss-sandbox:latest
   ```
3. If behind a proxy, configure Podman's proxy settings:
   ```bash
   # ~/.config/containers/containers.conf
   [engine]
   env = ["HTTP_PROXY=http://proxy:8080", "HTTPS_PROXY=http://proxy:8080"]
   ```
