// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { detectPlatform, needsMachine } from '../utils/platform.js';
import {
  isMachineRunning,
  startMachine,
  isContainerRunning,
  containerExists,
  podmanExec,
  podmanErrorMessage,
} from '../utils/podman.js';
import { readConfig, resolveSshKeyPath, ENV_PATH } from '../utils/config.js';

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
      '-v', 'iteron-data:/home/iteron:U',
      '--env-file', ENV_PATH,
      '--memory', memory,
      '--init',
    ];

    // IR-005: forward OpenCode credentials with UID remap for token refresh
    const opencodeAuth = opencodeAuthPath();
    if (existsSync(opencodeAuth)) {
      args.push('-v', `${opencodeAuth}:/home/iteron/.local/share/opencode/auth.json:U`);
    }

    // DR-003 §2: opt-in SSH key mount (local profile)
    const sshKeyPath = resolveSshKeyPath(config);
    let sshKeyBasename: string | undefined;
    if (sshKeyPath) {
      if (existsSync(sshKeyPath)) {
        sshKeyBasename = basename(sshKeyPath);
        args.push(
          '--tmpfs', '/run/iteron/ssh:size=4k,mode=0700,uid=1000,gid=1000',
          '-v', `${sshKeyPath}:/run/iteron/ssh/${sshKeyBasename}:ro`,
        );
      } else {
        console.warn(`Warning: SSH keyfile "${sshKeyPath}" not found on host; skipping SSH mount.`);
      }
    }

    args.push(image, 'sleep', 'infinity');
    await podmanExec(args);

    // Reconcile user-local tool directory (survives volume overlay on upgrade)
    await podmanExec(['exec', name, 'mkdir', '-p', '/home/iteron/.local/bin']);

    // DR-003 §2: write SSH config inside container when key is mounted
    if (sshKeyBasename) {
      await podmanExec(['exec', name, 'mkdir', '-p', '/home/iteron/.ssh']);
      await podmanExec(['exec', name, 'sh', '-c',
        `printf 'IdentityFile /run/iteron/ssh/${sshKeyBasename}\\n' > /home/iteron/.ssh/config`]);
      await podmanExec(['exec', name, 'chmod', '0600', '/home/iteron/.ssh/config']);
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
