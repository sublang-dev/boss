// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai>

import {
  isContainerRunning,
  podmanExec,
  podmanSpawn,
  podmanErrorMessage,
} from '../utils/podman.js';
import { readConfig, validateWorkspace } from '../utils/config.js';
import type { IteronConfig } from '../utils/config.js';

const CONTAINER_HOME = '/home/iteron';

/**
 * Resolve arguments into command, session name, and working directory.
 *
 * - 0 args: shell in ~
 * - 1 arg matching agent name: agent in ~
 * - 1 arg not matching: shell in ~/workspace
 * - 2 args: first is agent/command, second is workspace
 */
export function resolveArgs(
  args: string[],
  agents: IteronConfig['agents'],
): { binary: string; sessionName: string; workDir: string } {
  const defaultShell = 'bash';

  if (args.length === 0) {
    return {
      binary: defaultShell,
      sessionName: `${defaultShell}:~`,
      workDir: CONTAINER_HOME,
    };
  }

  if (args.length === 1) {
    const arg = args[0];
    const agent = agents[arg];
    if (agent) {
      // Known agent → run in home
      return {
        binary: agent.binary,
        sessionName: `${arg}:~`,
        workDir: CONTAINER_HOME,
      };
    }
    // Not an agent → shell in workspace
    const err = validateWorkspace(arg);
    if (err) throw new Error(err);
    return {
      binary: defaultShell,
      sessionName: `${defaultShell}:${arg}`,
      workDir: `${CONTAINER_HOME}/${arg}`,
    };
  }

  // 2 args: first is agent/command, second is workspace
  const [commandArg, workspace] = args;
  if (workspace !== '~') {
    const err = validateWorkspace(workspace);
    if (err) throw new Error(err);
  }
  const agent = agents[commandArg];
  const binary = agent ? agent.binary : commandArg;
  const commandName = commandArg; // Use the original name for session
  const location = workspace === '~' ? '~' : workspace;
  const workDir = workspace === '~' ? CONTAINER_HOME : `${CONTAINER_HOME}/${workspace}`;

  return {
    binary,
    sessionName: `${commandName}:${location}`,
    workDir,
  };
}

export function extractPassthroughArgs(commandArgs: string[]): string[] {
  const firstSeparator = commandArgs.indexOf('--');
  if (firstSeparator < 0) return [];
  return commandArgs.slice(firstSeparator + 1);
}

export async function openCommand(
  agentOrWorkspace?: string,
  workspace?: string,
  options?: { _: string[] },
  command?: { args: string[] },
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
    if (agentOrWorkspace !== undefined) positionalArgs.push(agentOrWorkspace);
    if (workspace !== undefined) positionalArgs.push(workspace);

    const resolved = resolveArgs(positionalArgs, config.agents);

    // Create workspace directory if needed
    if (resolved.workDir !== CONTAINER_HOME) {
      await podmanExec([
        'exec', name, 'mkdir', '-p', resolved.workDir,
      ]);
    }

    // Pass through exactly what comes after the first `--`.
    const extraArgs = extractPassthroughArgs(command?.args ?? []);

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
