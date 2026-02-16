// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import {
  isContainerRunning,
  podmanExec,
  podmanSpawn,
  podmanErrorMessage,
} from '../utils/podman.js';
import { readConfig, validateWorkspace } from '../utils/config.js';
import type { IteronConfig } from '../utils/config.js';
import { buildSessionName, validateSessionToken } from '../utils/session.js';
import { homedir } from 'node:os';

const CONTAINER_HOME = '/home/iteron';

/**
 * Normalize a workspace argument: if the shell expanded `~` to the
 * host home directory, map it back to the literal `~` token.
 */
function normalizeHome(arg: string): string {
  return arg === homedir() ? '~' : arg;
}

/**
 * Resolve arguments into command, session name, and working directory.
 *
 * Grammar: `iteron open [workspace] [command] [-- args]`
 *
 * - 0 args: shell in ~
 * - 1 arg: shell in workspace (~ for home, else ~/name)
 * - 2 args: arg1=workspace, arg2=command (looked up in agents for binary)
 */
export function resolveArgs(
  args: string[],
  agents: IteronConfig['agents'],
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
  const agent = agents[commandArg];
  const tokenErr = validateSessionToken(commandArg, agent ? 'Agent name' : 'Command name');
  if (tokenErr) throw new Error(tokenErr);
  const binary = agent ? agent.binary : commandArg;
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
    const config = await readConfig();
    const { name } = config.container;

    // Check container is running
    if (!(await isContainerRunning(name))) {
      console.error(`Container ${name} is not running. Run \`iteron start\` first.`);
      process.exit(1);
    }

    // Build positional args (0, 1, or 2)
    const positionalArgs: string[] = [];
    if (workspace !== undefined) positionalArgs.push(workspace);
    if (command !== undefined) positionalArgs.push(command);

    const resolved = resolveArgs(positionalArgs, config.agents);

    // Create workspace directory if needed
    if (resolved.workDir !== CONTAINER_HOME) {
      await podmanExec([
        'exec', name, 'mkdir', '-p', resolved.workDir,
      ]);
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
