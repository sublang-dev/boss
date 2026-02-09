// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai>

import {
  isContainerRunning,
  podmanExec,
  podmanErrorMessage,
} from '../utils/podman.js';
import { readConfig } from '../utils/config.js';

export interface SessionInfo {
  session: string;
  command: string;
  location: string;
  attached: boolean;
  uptime_seconds: number;
}

/**
 * Parse tmux list-sessions output into structured session info.
 *
 * Each line: `<session_name> <attached_count> <last_activity_epoch>`
 */
export function parseSessions(output: string): SessionInfo[] {
  if (!output.trim()) return [];

  const now = Math.floor(Date.now() / 1000);
  return output.trim().split('\n').map((line) => {
    const [sessionName, attachedCount, activityEpoch] = line.trim().split(' ');
    const colonIdx = sessionName.indexOf(':');
    const command = colonIdx >= 0 ? sessionName.slice(0, colonIdx) : sessionName;
    const location = colonIdx >= 0 ? sessionName.slice(colonIdx + 1) : '~';
    const attached = parseInt(attachedCount, 10) > 0;
    const uptime_seconds = now - parseInt(activityEpoch, 10);

    return {
      session: sessionName,
      command,
      location,
      attached,
      uptime_seconds: Math.max(0, uptime_seconds),
    };
  });
}

/**
 * Format uptime in seconds to a human-readable string.
 */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Build tree output grouping sessions by workspace location.
 */
export function formatTree(
  sessions: SessionInfo[],
  workspaces: string[],
): string {
  // Group sessions by location
  const byLocation = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    const list = byLocation.get(s.location) ?? [];
    list.push(s);
    byLocation.set(s.location, list);
  }

  // Collect all locations: sessions + workspace dirs
  const allLocations = new Set<string>();
  for (const s of sessions) allLocations.add(s.location);
  for (const w of workspaces) allLocations.add(w);

  // Sort: ~ first, then alphabetically
  const sorted = [...allLocations].sort((a, b) => {
    if (a === '~') return -1;
    if (b === '~') return 1;
    return a.localeCompare(b);
  });

  const lines: string[] = [];
  for (const loc of sorted) {
    const label = loc === '~' ? '~/ (home)' : `${loc}/`;
    lines.push(label);
    const locSessions = byLocation.get(loc) ?? [];
    for (const s of locSessions) {
      const status = s.attached ? 'attached' : 'detached';
      lines.push(`  ${s.command} (${status}, ${formatUptime(s.uptime_seconds)})`);
    }
  }

  return lines.join('\n');
}

export async function lsCommand(options: { json?: boolean }): Promise<void> {
  try {
    const config = await readConfig();
    const { name } = config.container;

    if (!(await isContainerRunning(name))) {
      console.error(`Container ${name} is not running. Run \`iteron start\` first.`);
      process.exit(1);
    }

    // Query tmux sessions
    let sessionOutput = '';
    try {
      const result = await podmanExec([
        'exec', name, 'tmux', 'list-sessions',
        '-F', '#{session_name} #{session_attached} #{session_activity}',
      ]);
      sessionOutput = result.stdout;
    } catch {
      // No tmux server running = no sessions
    }

    const sessions = parseSessions(sessionOutput);

    // Scan workspace directories (exclude dotfiles)
    let workspaces: string[] = [];
    try {
      const result = await podmanExec([
        'exec', name, 'sh', '-c',
        'ls -1d /home/iteron/*/ 2>/dev/null | xargs -I{} basename {} || true',
      ]);
      workspaces = result.stdout.split('\n').filter(Boolean);
    } catch {
      // No workspaces
    }

    if (options.json) {
      console.log(JSON.stringify(sessions, null, 2));
    } else {
      if (sessions.length === 0 && workspaces.length === 0) {
        console.log('No workspaces or sessions.');
        return;
      }
      console.log(formatTree(sessions, workspaces));
    }
  } catch (error) {
    console.error(`Error: ${podmanErrorMessage(error)}`);
    process.exit(1);
  }
}
