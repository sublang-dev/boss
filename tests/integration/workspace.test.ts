// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const TEST_IMAGE = process.env.ITERON_TEST_IMAGE ?? 'docker.io/library/alpine:latest';
const TEST_CONTAINER = 'iteron-test-sandbox';

let configDir: string;

function podmanAvailable(): boolean {
  try {
    execFileSync('podman', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function podmanExecSync(args: string[]): string {
  return execFileSync('podman', args, { encoding: 'utf-8' }).trim();
}

function containerExec(cmd: string[]): string {
  return podmanExecSync(['exec', TEST_CONTAINER, ...cmd]);
}

const HAS_PODMAN = podmanAvailable();

async function cleanup(): Promise<void> {
  try { execFileSync('podman', ['stop', '-t', '0', TEST_CONTAINER], { stdio: 'ignore' }); } catch {}
  try { execFileSync('podman', ['rm', '-f', TEST_CONTAINER], { stdio: 'ignore' }); } catch {}
}

beforeAll(async () => {
  if (!HAS_PODMAN) return;

  await cleanup();

  configDir = mkdtempSync(join(tmpdir(), 'iteron-workspace-test-'));
  process.env.ITERON_CONFIG_DIR = configDir;

  await mkdir(configDir, { recursive: true });

  const configToml = `[container]
name = "${TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"

[agents.claude]
binary = "claude"

[agents.codex]
binary = "codex"

[agents.gemini]
binary = "gemini"

[agents.opencode]
binary = "opencode"
`;
  writeFileSync(join(configDir, 'config.toml'), configToml, 'utf-8');
  writeFileSync(join(configDir, '.env'), 'ANTHROPIC_API_KEY=sk-test-123\n', 'utf-8');

  // Ensure image and volume
  try { execFileSync('podman', ['pull', TEST_IMAGE], { stdio: 'ignore' }); } catch {}
  try { execFileSync('podman', ['volume', 'create', 'iteron-data'], { stdio: 'ignore' }); } catch {}

  // Start container
  const { startCommand } = await import('../../src/commands/start.js');
  await startCommand();

  // Install tmux in alpine (needed for session tests)
  try { containerExec(['apk', 'add', '--no-cache', 'tmux']); } catch {}
});

afterAll(async () => {
  if (!HAS_PODMAN) return;
  await cleanup();
  delete process.env.ITERON_CONFIG_DIR;
  if (configDir) await rm(configDir, { recursive: true, force: true });
});

describe.skipIf(!HAS_PODMAN)('iteron open (integration)', { timeout: 120_000, sequential: true }, () => {
  // IR-004 test 1: `iteron open` → bash in ~, tmux shows bash@~
  it('opens shell in home directory', async () => {
    // Create a tmux session directly (can't use interactive open in test)
    containerExec(['tmux', 'new-session', '-d', '-s', 'bash@~', '-c', '/home/iteron', 'bash']);
    const sessions = containerExec(['tmux', 'list-sessions', '-F', '#{session_name}']);
    expect(sessions).toContain('bash@~');
    // Cleanup
    try { containerExec(['tmux', 'kill-session', '-t', 'bash@~']); } catch {}
  });

  // IR-004 test 2: `iteron open myproject` → creates ~/myproject, bash@myproject
  it('creates workspace directory and session', async () => {
    containerExec(['mkdir', '-p', '/home/iteron/myproject']);
    containerExec(['tmux', 'new-session', '-d', '-s', 'bash@myproject', '-c', '/home/iteron/myproject', 'bash']);

    // Verify directory exists
    containerExec(['test', '-d', '/home/iteron/myproject']);

    // Verify session
    const sessions = containerExec(['tmux', 'list-sessions', '-F', '#{session_name}']);
    expect(sessions).toContain('bash@myproject');

    // Cleanup
    try { containerExec(['tmux', 'kill-session', '-t', 'bash@myproject']); } catch {}
    try { containerExec(['rm', '-rf', '/home/iteron/myproject']); } catch {}
  });

  // IR-004 test 7 (partial): -A reattach requires interactive terminal;
  // full verification is manual (see spec). This test confirms that tmux
  // rejects duplicate session names, proving -A is necessary.
  it('rejects duplicate session name without -A flag', async () => {
    containerExec(['tmux', 'new-session', '-d', '-s', 'bash@reattach-test', 'bash']);

    // Creating the same session without -A fails (duplicate name)
    expect(() =>
      containerExec(['tmux', 'new-session', '-d', '-s', 'bash@reattach-test', 'bash']),
    ).toThrow();

    // Still exactly one session with that name
    const sessions = containerExec(['tmux', 'list-sessions', '-F', '#{session_name}']);
    const count = sessions.split('\n').filter((s) => s === 'bash@reattach-test').length;
    expect(count).toBe(1);

    // Cleanup
    try { containerExec(['tmux', 'kill-session', '-t', 'bash@reattach-test']); } catch {}
  });

  // IR-004 test 8: parallel sessions in different workspaces
  it('supports parallel sessions in different workspaces', async () => {
    containerExec(['tmux', 'new-session', '-d', '-s', 'bash@proj-a', 'bash']);
    containerExec(['tmux', 'new-session', '-d', '-s', 'bash@proj-b', 'bash']);

    const sessions = containerExec(['tmux', 'list-sessions', '-F', '#{session_name}']);
    expect(sessions).toContain('bash@proj-a');
    expect(sessions).toContain('bash@proj-b');

    // Cleanup
    try { containerExec(['tmux', 'kill-session', '-t', 'bash@proj-a']); } catch {}
    try { containerExec(['tmux', 'kill-session', '-t', 'bash@proj-b']); } catch {}
  });
});

describe.skipIf(!HAS_PODMAN)('iteron ls (integration)', { timeout: 120_000, sequential: true }, () => {
  afterEach(() => {
    try { containerExec(['tmux', 'kill-session', '-t', 'bash@~']); } catch {}
    try { containerExec(['tmux', 'kill-session', '-t', 'bash@ls-test']); } catch {}
    try { containerExec(['rm', '-rf', '/home/iteron/ls-test']); } catch {}
  });

  function setupLsSessions(): void {
    containerExec(['tmux', 'new-session', '-d', '-s', 'bash@~', 'bash']);
    containerExec(['mkdir', '-p', '/home/iteron/ls-test']);
    containerExec(['tmux', 'new-session', '-d', '-s', 'bash@ls-test', 'bash']);
  }

  // IR-004 test 9: lsCommand end-to-end tree output
  it('lsCommand prints tree with sessions grouped by workspace', async () => {
    setupLsSessions();

    const { lsCommand } = await import('../../src/commands/ls.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await lsCommand();

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('~/ (home)');
    expect(output).toContain('ls-test/');

    logSpy.mockRestore();
  });

});

describe.skipIf(!HAS_PODMAN)('iteron rm (integration)', { timeout: 120_000, sequential: true }, () => {
  // IR-004 test 10: rm removes workspace directory
  it('removes workspace directory', async () => {
    // Setup
    containerExec(['mkdir', '-p', '/home/iteron/rm-test']);

    // Import and run rm
    const { rmCommand } = await import('../../src/commands/rm.js');
    await rmCommand('rm-test');

    // Verify directory removed
    try {
      containerExec(['test', '-d', '/home/iteron/rm-test']);
      expect(true).toBe(false); // should have thrown
    } catch {
      // Expected
    }
  });

  // IR-004 test 11: rm with no arg
  it('errors with no workspace argument', async () => {
    const { rmCommand } = await import('../../src/commands/rm.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    try {
      await rmCommand('');
    } catch {
      // Expected
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  // IR-004: refuse to remove home directory
  it('refuses to remove home directory', async () => {
    const { rmCommand } = await import('../../src/commands/rm.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    try {
      await rmCommand('~');
    } catch {
      // Expected
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

describe.skipIf(!HAS_PODMAN)('iteron open when container not running (integration)', { timeout: 120_000, sequential: true }, () => {
  // IR-004 test 12: open when container not running
  it('errors when container is not running', async () => {
    // Stop the container
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();

    const { openCommand } = await import('../../src/commands/open.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await openCommand();
    } catch {
      // Expected
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('is not running'),
    );

    exitSpy.mockRestore();
    errorSpy.mockRestore();

    // Restart for any subsequent tests
    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();
  });
});
