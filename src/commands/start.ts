// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { detectPlatform, needsMachine } from '../utils/platform.js';
import {
  isMachineRunning,
  startMachine,
  isContainerRunning,
  containerExists,
  podmanExec,
  podmanExecStdin,
  podmanErrorMessage,
} from '../utils/podman.js';
import { readConfig, resolveSshKeyPaths, uniqueSshKeyNames, ENV_PATH } from '../utils/config.js';

/** Resolve OpenCode auth file honoring XDG_DATA_HOME. */
export function opencodeAuthPath(): string {
  const dataHome = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(dataHome, 'opencode', 'auth.json');
}

export async function startCommand(): Promise<void> {
  try {
    const config = await readConfig();
    const { name, image, memory } = config.container;

    // Ensure machine running on macOS/WSL
    const platform = detectPlatform();
    if (needsMachine(platform) && !(await isMachineRunning())) {
      console.log('Starting Podman machine...');
      await startMachine();
    }

    // Check if already running
    if (await isContainerRunning(name)) {
      console.log(`Container "${name}" is already running.`);
      return;
    }

    // Remove stopped container if it exists
    if (await containerExists(name)) {
      await podmanExec(['rm', name]);
    }

    // Launch with security hardening per IR-002 §3
    console.log(`Starting container "${name}"...`);
    const args = [
      'run', '-d',
      '--name', name,
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--read-only',
      '--tmpfs', '/tmp',
      '-v', 'boss-data:/home/boss:U',
      '--env-file', ENV_PATH,
      '--memory', memory,
      '--init',
    ];

    // IR-005: forward OpenCode credentials with UID remap for token refresh
    const opencodeAuth = opencodeAuthPath();
    if (existsSync(opencodeAuth)) {
      args.push('-v', `${opencodeAuth}:/home/boss/.local/share/opencode/auth.json:U`);
    }

    // DR-003 §2: opt-in SSH key mount (local profile)
    // Keys are injected post-start via exec (not bind-mounted) to avoid
    // ownership issues in rootless Podman with --cap-drop ALL.
    const allSshKeyPaths = resolveSshKeyPaths(config);
    const existingKeyPaths = allSshKeyPaths.filter(p => {
      if (existsSync(p)) return true;
      console.warn(`Warning: SSH keyfile "${p}" not found on host; skipping.`);
      return false;
    });

    if (existingKeyPaths.length > 0) {
      args.push('--tmpfs', `/run/boss/ssh:size=${64 * existingKeyPaths.length}k`);
    }

    args.push(image, 'sleep', 'infinity');
    await podmanExec(args);

    // Wait for container to accept exec sessions (podman run -d returns
    // before the container reaches the Running state on some platforms)
    let running = false;
    for (let i = 0; i < 30; i++) {
      if (await isContainerRunning(name)) { running = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    if (!running) {
      console.error(`Error: container "${name}" did not reach running state within 3 s.`);
      process.exit(1);
    }

    // Reconcile user-local tool directory (survives volume overlay on upgrade)
    await podmanExec(['exec', name, 'mkdir', '-p', '/home/boss/.local/bin']);

    // DR-004 §5: reconcile mise tools (idempotent; fast when tools are present).
    // Guard: skip when mise is absent (e.g., pre-IR-008 images).
    let hasMise = false;
    try {
      await podmanExec(['exec', name, 'sh', '-c', 'command -v mise >/dev/null']);
      hasMise = true;
    } catch {
      // mise not available — tools are managed directly in the image
    }
    if (hasMise) {
      // Seed user-global mise config if absent (pre-IR-008 volumes lack it).
      await podmanExec(['exec', name, 'sh', '-c',
        'test -f ~/.config/mise/config.toml || { mkdir -p ~/.config/mise && touch ~/.config/mise/config.toml; }']);
      // DR-004 §5: reconcile mise tools. Non-fatal because tools are already
      // on the volume (populated from the image on first use). Reconciliation
      // only matters after image upgrades when the volume has stale artifacts.
      try {
        await podmanExec(['exec', '-e', 'MISE_VERBOSE=1', name,
          'mise', 'trust', '/etc/mise/config.toml']);
        await podmanExec(['exec', '-e', 'MISE_VERBOSE=1', name,
          'mise', 'trust', '/home/boss/.config/mise/config.toml']);
        // --locked: use the image's lockfile read-only (rootfs is read-only at runtime).
        await podmanExec(['exec', '-e', 'MISE_VERBOSE=1', name,
          'mise', 'install', '--locked']);
      } catch (miseErr) {
        console.warn(`Warning: mise reconciliation failed: ${podmanErrorMessage(miseErr)}`);
      }
    }

    // DR-003 §2: reconcile managed SSH config in container
    if (existingKeyPaths.length > 0) {
      const keyNames = uniqueSshKeyNames(existingKeyPaths);
      const identityLines: string[] = [];

      for (const keyPath of existingKeyPaths) {
        // Inject key into tmpfs as boss (exec runs as container user) so
        // the file is owned by boss with 0600 — no CAP_CHOWN needed.
        // Key data is piped over stdin to avoid exposing it in argv.
        const keyData = await readFile(keyPath, 'utf-8');
        const keyDest = `/run/boss/ssh/${keyNames.get(keyPath)}`;
        await podmanExecStdin(
          ['exec', '-i', name, 'sh', '-c', `cat > "$1" && chmod 0600 "$1"`, 'boss-ssh', keyDest],
          keyData,
        );
        identityLines.push(`IdentityFile ${keyDest}`);
      }

      // Write managed include file with all IdentityFile directives
      await podmanExec(['exec', name, 'mkdir', '-p', '/home/boss/.ssh/config.d']);
      const confContent = identityLines.join('\n') + '\n';
      await podmanExecStdin(
        ['exec', '-i', name, 'sh', '-c',
          'cat > /home/boss/.ssh/config.d/boss.conf && chmod 0600 /home/boss/.ssh/config.d/boss.conf'],
        confContent,
      );
    } else {
      // Remove stale managed config from a previous keyfile start
      try {
        await podmanExec(['exec', name, 'rm', '-f', '/home/boss/.ssh/config.d/boss.conf']);
      } catch {
        // config.d may not exist yet — nothing to clean
      }
    }

    // Verify
    if (await isContainerRunning(name)) {
      console.log(`Container "${name}" is running.`);
    } else {
      console.error(`Error: container "${name}" failed to start.`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${podmanErrorMessage(error)}`);
    process.exit(1);
  }
}
