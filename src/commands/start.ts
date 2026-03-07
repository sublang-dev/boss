// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { detectPlatform, needsMachine } from '../utils/platform.js';
import {
  isMachineRunning,
  machineExists,
  startMachine,
  isContainerRunning,
  containerExists,
  podmanExec,
  podmanExecStdin,
  podmanErrorMessage,
} from '../utils/podman.js';
import { readConfig, resolveSshKeyPaths, uniqueSshKeyNames, ENV_PATH } from '../utils/config.js';

const MISE_STATE_FILE = '.boss-mise-reconcile.state';
const MISE_PROGRESS_FILE = '.boss-mise-reconcile.in-progress';
const MISE_STATE_POLL_INTERVAL_MS = 200;
const MISE_STATE_POLL_TIMEOUT_MS = 300_000;
const MISE_STATE_BOOTSTRAP_GRACE_MS = 3_000;
const MISE_STATE_IN_PROGRESS = '__BOSS_MISE_STATE_IN_PROGRESS__';

interface MiseStateProbeResult {
  state: MiseReconcileState | null;
  timedOut: boolean;
}

export interface MiseReconcileState {
  status: 'ok' | 'error' | 'skipped' | string;
  fingerprint?: string;
  failedStep?: string;
  errorClass?: string;
  errorMessage?: string;
  shouldWarn?: boolean;
  updatedAtEpoch?: number;
}

/** Resolve OpenCode auth file honoring XDG_DATA_HOME. */
export function opencodeAuthPath(): string {
  const dataHome = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(dataHome, 'opencode', 'auth.json');
}

function parseKeyValueState(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf('=');
    if (sep <= 0) continue;
    const key = trimmed.slice(0, sep);
    const value = trimmed.slice(sep + 1);
    result[key] = value;
  }
  return result;
}

export function parseMiseReconcileState(content: string): MiseReconcileState | null {
  const kv = parseKeyValueState(content);
  if (!kv.status) return null;

  const updatedAtEpoch = Number.parseInt(kv.updated_at_epoch ?? '', 10);
  const shouldWarn = kv.should_warn === '1' ? true : kv.should_warn === '0' ? false : undefined;
  return {
    status: kv.status,
    fingerprint: kv.fingerprint,
    failedStep: kv.failed_step,
    errorClass: kv.error_class,
    errorMessage: kv.error_message,
    shouldWarn,
    updatedAtEpoch: Number.isFinite(updatedAtEpoch) ? updatedAtEpoch : undefined,
  };
}

export function formatMiseWarning(state: MiseReconcileState): string | null {
  if (state.shouldWarn === false) return null;
  const step = state.failedStep ?? 'unknown-step';
  const klass = state.errorClass ?? 'unknown';
  const message = state.errorMessage ?? 'unknown error';

  if (state.status === 'error') {
    return `Warning: mise reconciliation failed (${step}/${klass}): ${message}`;
  }
  if (state.status === 'ok' && state.failedStep === 'user_lock_missing') {
    return `Warning: mise reconciliation hint (${step}/${klass}): ${message}`;
  }
  return null;
}

async function readEntrypointMiseState(
  containerName: string,
  minUpdatedAtEpoch?: number,
): Promise<MiseStateProbeResult> {
  const probeScript = [
    'state_home="${XDG_STATE_HOME:-/home/boss/.local/state}"',
    `state_file="$state_home/${MISE_STATE_FILE}"`,
    `progress_file="$state_home/${MISE_PROGRESS_FILE}"`,
    'if [ -f "$progress_file" ]; then',
    `  printf '%s\\n' '${MISE_STATE_IN_PROGRESS}'`,
    '  exit 0',
    'fi',
    'if [ -f "$state_file" ]; then',
    '  cat "$state_file"',
    'fi',
  ].join('\n');

  const deadline = Date.now() + MISE_STATE_POLL_TIMEOUT_MS;
  const bootstrapDeadline = Date.now() + MISE_STATE_BOOTSTRAP_GRACE_MS;
  let progressShown = false;
  while (Date.now() < deadline) {
    const { stdout } = await podmanExec(['exec', containerName, 'sh', '-c', probeScript]);
    const trimmed = stdout.trim();
    if (!trimmed) {
      // New images write the in-progress marker near PID1 start. Briefly
      // retry empty reads before treating this as a legacy (no-state) image.
      if (Date.now() < bootstrapDeadline) {
        await new Promise(r => setTimeout(r, MISE_STATE_POLL_INTERVAL_MS));
        continue;
      }
      return { state: null, timedOut: false };
    }
    if (trimmed === MISE_STATE_IN_PROGRESS) {
      if (!progressShown) {
        process.stderr.write('Waiting for tool reconciliation...');
        progressShown = true;
      }
      await new Promise(r => setTimeout(r, MISE_STATE_POLL_INTERVAL_MS));
      continue;
    }
    if (progressShown) process.stderr.write(' done.\n');

    const state = parseMiseReconcileState(trimmed);
    if (
      state
      && minUpdatedAtEpoch !== undefined
      && Date.now() < bootstrapDeadline
      && (state.updatedAtEpoch === undefined || state.updatedAtEpoch <= minUpdatedAtEpoch)
    ) {
      // A pre-existing volume can expose last-run state before the entrypoint
      // overwrites it for this boot; wait a short grace window for fresh state.
      await new Promise(r => setTimeout(r, MISE_STATE_POLL_INTERVAL_MS));
      continue;
    }
    return { state, timedOut: false };
  }

  if (progressShown) process.stderr.write('\n');
  console.warn('Warning: timed out waiting for mise reconciliation state from entrypoint.');
  return { state: null, timedOut: true };
}

async function reconcileMiseLegacy(containerName: string): Promise<void> {
  // Guard: skip when mise is absent (e.g., pre-IR-008 images).
  let hasMise = false;
  try {
    await podmanExec(['exec', containerName, 'sh', '-c', 'command -v mise >/dev/null']);
    hasMise = true;
  } catch {
    // mise not available — tools are managed directly in the image
  }
  if (!hasMise) return;

  // Seed user-global mise config if absent (pre-IR-008 volumes lack it).
  await podmanExec(['exec', containerName, 'sh', '-c',
    'test -f ~/.config/mise/config.toml || { mkdir -p ~/.config/mise && touch ~/.config/mise/config.toml; }']);

  try {
    await podmanExec(['exec', containerName, 'mise', 'trust', '/etc/mise/config.toml']);
    await podmanExec(['exec', containerName, 'mise', 'trust', '/home/boss/.config/mise/config.toml']);
    // --locked: use the image's lockfile read-only (rootfs is read-only at runtime).
    await podmanExec(['exec', containerName, 'mise', 'install', '--locked']);
  } catch (miseErr) {
    console.warn(`Warning: mise reconciliation failed: ${podmanErrorMessage(miseErr)}`);
  }
}

export async function startCommand(): Promise<void> {
  try {
    const config = await readConfig();
    const { name, image, memory } = config.container;

    // Ensure machine running on macOS/WSL
    const platform = detectPlatform();
    if (needsMachine(platform) && !(await isMachineRunning())) {
      if (!(await machineExists())) {
        console.error('Error: No Podman machine found. Run "boss init" to set up your environment.');
        process.exit(1);
      }
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

    const containerStartEpoch = Math.floor(Date.now() / 1000);
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

    try {
      const probe = await readEntrypointMiseState(name, containerStartEpoch);
      if (probe.state) {
        const warning = formatMiseWarning(probe.state);
        if (warning) console.warn(warning);
      } else if (!probe.timedOut) {
        // Backward compatibility for older images that do not write state.
        await reconcileMiseLegacy(name);
      }
    } catch {
      // State read failures should not block startup.
      try {
        await reconcileMiseLegacy(name);
      } catch {
        // Legacy fallback also failed to execute; continue startup.
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
