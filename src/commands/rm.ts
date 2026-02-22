// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { createInterface } from 'node:readline';
import {
  isContainerRunning,
  podmanExec,
  podmanErrorMessage,
} from '../utils/podman.js';
import { readConfig, validateWorkspace } from '../utils/config.js';
import { parseSessions } from './ls.js';

function confirm(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export async function rmCommand(
  workspace: string,
): Promise<void> {
  try {
    if (!workspace) {
      console.error('Usage: boss rm <workspace>');
      process.exit(1);
    }

    if (workspace === '~') {
      console.error('Error: cannot remove the home directory. Use `boss stop` to shut down the container.');
      process.exit(1);
    }

    const validationError = validateWorkspace(workspace);
    if (validationError) {
      console.error(`Error: ${validationError}`);
      process.exit(1);
    }

    const config = await readConfig();
    const { name } = config.container;

    if (!(await isContainerRunning(name))) {
      console.error(`Container ${name} is not running. Run \`boss start\` first.`);
      process.exit(1);
    }

    // Find sessions in this workspace
    let matchingSessions: string[] = [];
    try {
      const result = await podmanExec([
        'exec', name, 'tmux', 'list-sessions',
        '-F', '#{session_name} #{session_attached} #{session_activity}',
      ]);
      const sessions = parseSessions(result.stdout);
      matchingSessions = sessions
        .filter((s) => s.location === workspace)
        .map((s) => s.session);
    } catch {
      // No tmux server = no sessions
    }

    // Confirmation prompt when active sessions would be killed
    if (matchingSessions.length > 0) {
      const sessionList = matchingSessions.join(', ');
      const proceed = await confirm(
        `Kill ${sessionList}? [y/N] `,
      );
      if (!proceed) {
        console.log('Aborted.');
        return;
      }
    }

    // Kill matching tmux sessions
    for (const session of matchingSessions) {
      try {
        await podmanExec([
          'exec', name, 'tmux', 'kill-session', '-t', session,
        ]);
      } catch {
        // Session may have already exited
      }
    }

    // Remove workspace directory
    try {
      await podmanExec([
        'exec', name, 'rm', '-rf', `/home/boss/${workspace}`,
      ]);
    } catch {
      // Directory may not exist
    }

    console.log(`Workspace "${workspace}" removed.`);
  } catch (error) {
    console.error(`Error: ${podmanErrorMessage(error)}`);
    process.exit(1);
  }
}
