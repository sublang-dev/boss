// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { detectPlatform, needsMachine } from '../utils/platform.js';
import {
  isMachineRunning,
  startMachine,
  isContainerRunning,
  containerExists,
  podmanExec,
  podmanErrorMessage,
} from '../utils/podman.js';
import { readConfig, ENV_PATH } from '../utils/config.js';

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

    args.push(image, 'sleep', 'infinity');
    await podmanExec(args);

    // Reconcile user-local tool directory (survives volume overlay on upgrade)
    await podmanExec(['exec', name, 'mkdir', '-p', '/home/iteron/.local/bin']);

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
