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

const CONTAINER_HOME = '/home/iteron';

/**
 * Detect deprecated agent-first argument form and return swapped args.
 *
 * Old form: `iteron open <agent> [workspace]`
 * New form: `iteron open <workspace> [command]`
 *
 * Returns swapped args and a hint message, or null if not deprecated.
 */
export function detectDeprecatedForm(
  args: string[],
  agents: IteronConfig['agents'],
): { swapped: string[]; hint: string } | null {
  if (args.length === 1 && agents[args[0]]) {
    // `iteron open claude` → `iteron open ~ claude`
    return {
      swapped: ['~', args[0]],
      hint: `Deprecated: use "iteron open ~ ${args[0]}" instead of "iteron open ${args[0]}". Old form will be removed in a future release.`,
    };
  }
  if (args.length === 2 && agents[args[0]] && !agents[args[1]]) {
    const wsErr = validateWorkspace(args[1]);
    if (!wsErr || args[1] === '~') {
      // `iteron open claude myproject` → `iteron open myproject claude`
      return {
        swapped: [args[1], args[0]],
        hint: `Deprecated: use "iteron open ${args[1]} ${args[0]}" instead of "iteron open ${args[0]} ${args[1]}". Old form will be removed in a future release.`,
      };
    }
  }
  return null;
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
    const workspace = args[0];
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
  const [workspace, commandArg] = args;
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

    // Detect deprecated agent-first form and swap args
    const deprecated = detectDeprecatedForm(positionalArgs, config.agents);
    if (deprecated) {
      console.error(deprecated.hint);
      positionalArgs.length = 0;
      positionalArgs.push(...deprecated.swapped);
    }

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
