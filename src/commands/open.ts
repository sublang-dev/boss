// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import {
  isContainerRunning,
  podmanExec,
  podmanSpawn,
  podmanErrorMessage,
} from '../utils/podman.js';
import { readConfig, validateWorkspace, KNOWN_AGENTS, ON_DEMAND_AGENTS } from '../utils/config.js';
import { startCommand } from './start.js';
import { buildSessionName, validateSessionToken } from '../utils/session.js';
import { homedir } from 'node:os';

const CONTAINER_HOME = '/home/boss';
const ONDEMAND_CONFIG = '/etc/mise/ondemand.toml';
const ONDEMAND_LOCK = '/etc/mise/ondemand.lock';

/**
 * Ensure an on-demand agent is installed inside the container.
 *
 * Installs from the image-owned on-demand config+lockfile, then creates a
 * symlink at ~/.local/bin/<agent> pointing to the real binary.  This
 * bypasses mise's shim/config resolution entirely — no user-config
 * pollution, no lockfile side-effects — while keeping the agent on PATH.
 * The symlink also serves as the activation marker that the entrypoint
 * checks for restart reconciliation.
 */
async function ensureOnDemandAgent(
  containerName: string,
  agent: string,
): Promise<void> {
  // Skip if the agent is already available through a supported path:
  //   - our symlink or a user-placed binary in ~/.local/bin
  //   - a working mise-managed tool (mise use -g)
  //   - a native package-manager install (DR-005), e.g. npm install -g
  //     into ~/.local/share/npm-global/bin
  // We use `command -v` to cover all PATH entries, then filter out stale
  // mise shims (left from an older image that baked the tool in) — those
  // live under ~/.local/share/mise/shims/ and fail `mise which`.
  try {
    await podmanExec([
      'exec', containerName, 'sh', '-c',
      `p="$(command -v ${agent} 2>/dev/null)" || exit 1; `
      + `case "$p" in */mise/shims/*) mise which ${agent} >/dev/null 2>&1;; esac`,
    ]);
    return; // already available — respect existing install
  } catch {
    // not available through any supported means — proceed with install
  }

  console.log(`Installing ${agent} (first use)...`);

  const script = [
    'set -eu',
    'td="$(mktemp -d /tmp/boss-ondemand.XXXXXX)"',
    `cp ${ONDEMAND_CONFIG} "$td/mise.toml"`,
    `cp ${ONDEMAND_LOCK} "$td/mise.lock"`,
    'mise trust "$td/mise.toml"',
    'ignore="/etc/mise/config.toml:$HOME/.config/mise/config.toml"',
    'MISE_IGNORED_CONFIG_PATHS="$ignore" mise -C "$td" install --locked',
    // Resolve real binary path while the temp config is still active.
    `real_bin="$(MISE_IGNORED_CONFIG_PATHS="$ignore" mise -C "$td" which ${agent})"`,
    'rm -rf "$td"',
    // Symlink into ~/.local/bin so the agent is on PATH without touching
    // the user-global mise config or relying on mise shims.
    'mkdir -p ~/.local/bin',
    `ln -sf "$real_bin" ~/.local/bin/${agent}`,
    // Remove any stale mise shim that would shadow our symlink (left over
    // from an older image that baked the tool in).
    `rm -f ~/.local/share/mise/shims/${agent}`,
    // OpenCode ships unused musl binaries — clean them up
    ...(agent === 'opencode'
      ? ['find ~/.local/share/mise/installs -type d -name \'opencode-linux-*-musl\' -exec rm -rf {} + 2>/dev/null || true']
      : []),
  ].join('\n');

  await podmanExec(['exec', containerName, 'sh', '-c', script]);
}

/**
 * Normalize a workspace argument: if the shell expanded `~` to the
 * host home directory, map it back to the literal `~` token.
 */
function normalizeHome(arg: string): string {
  const stripped = arg.replace(/\/+$/, '');
  return (arg === '~' || stripped === homedir()) ? '~' : arg;
}

/**
 * Resolve arguments into command, session name, and working directory.
 *
 * Grammar: `boss open [workspace] [command] [-- args]`
 *
 * - 0 args: shell in ~
 * - 1 arg: shell in workspace (~ for home, else ~/name)
 * - 2 args: arg1=workspace, arg2=command (used as binary directly)
 */
export function resolveArgs(
  args: string[],
): { binary: string; sessionName: string; workDir: string } {
  const defaultShell = 'bash';

  if (args.length === 0) {
    return {
      binary: defaultShell,
      sessionName: buildSessionName(defaultShell, '~'),
      workDir: CONTAINER_HOME,
    };
  }

  if (args.length === 1) {
    const workspace = normalizeHome(args[0]);
    if (workspace === '~') {
      return {
        binary: defaultShell,
        sessionName: buildSessionName(defaultShell, '~'),
        workDir: CONTAINER_HOME,
      };
    }
    const err = validateWorkspace(workspace);
    if (err) throw new Error(err);
    return {
      binary: defaultShell,
      sessionName: buildSessionName(defaultShell, workspace),
      workDir: `${CONTAINER_HOME}/${workspace}`,
    };
  }

  // 2 args: first is workspace, second is command
  const [rawWorkspace, commandArg] = args;
  const workspace = normalizeHome(rawWorkspace);
  if (workspace !== '~') {
    const err = validateWorkspace(workspace);
    if (err) throw new Error(err);
  }
  const isKnownAgent = KNOWN_AGENTS.has(commandArg);
  const tokenErr = validateSessionToken(commandArg, isKnownAgent ? 'Agent name' : 'Command name');
  if (tokenErr) throw new Error(tokenErr);
  const binary = commandArg;
  const location = workspace === '~' ? '~' : workspace;
  const workDir = workspace === '~' ? CONTAINER_HOME : `${CONTAINER_HOME}/${workspace}`;

  return {
    binary,
    sessionName: buildSessionName(commandArg, location),
    workDir,
  };
}

export function extractPassthroughArgs(commandArgs: string[]): string[] {
  const firstSeparator = commandArgs.indexOf('--');
  if (firstSeparator < 0) return [];
  return commandArgs.slice(firstSeparator + 1);
}

export async function openCommand(
  workspace?: string,
  command?: string,
  options?: { _: string[] },
  commandObj?: { args: string[] },
): Promise<void> {
  try {
    // Validate arguments before any side effects
    const positionalArgs: string[] = [];
    if (workspace !== undefined) positionalArgs.push(workspace);
    if (command !== undefined) positionalArgs.push(command);

    const resolved = resolveArgs(positionalArgs);

    const config = await readConfig();
    const { name } = config.container;

    // Auto-start container if not running
    if (!(await isContainerRunning(name))) {
      await startCommand();
    }

    // Create workspace directory if needed
    if (resolved.workDir !== CONTAINER_HOME) {
      await podmanExec([
        'exec', name, 'mkdir', '-p', resolved.workDir,
      ]);
    }

    // Install on-demand agent if needed (before launching tmux)
    if (ON_DEMAND_AGENTS.has(resolved.binary)) {
      await ensureOnDemandAgent(name, resolved.binary);
    }

    // Pass through exactly what comes after the first `--`.
    const extraArgs = extractPassthroughArgs(commandObj?.args ?? []);

    // Build tmux command
    const tmuxArgs = [
      'new-session', '-A',
      '-s', resolved.sessionName,
      '-c', resolved.workDir,
      resolved.binary,
      ...extraArgs,
    ];

    // podman exec -it <container> tmux <tmux-args>
    await podmanSpawn([
      'exec', '-it', name,
      'tmux', ...tmuxArgs,
    ]);
  } catch (error) {
    console.error(`Error: ${podmanErrorMessage(error)}`);
    process.exit(1);
  }
}
