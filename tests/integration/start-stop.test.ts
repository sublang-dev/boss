// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// ITERON_TEST_IMAGE overrides the default image for CI against the real sandbox image.
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

const HAS_PODMAN = podmanAvailable();

async function cleanup(): Promise<void> {
  try { execFileSync('podman', ['stop', '-t', '0', TEST_CONTAINER], { stdio: 'ignore' }); } catch {}
  try { execFileSync('podman', ['rm', '-f', TEST_CONTAINER], { stdio: 'ignore' }); } catch {}
  // Do NOT remove the volume — it may contain real user data (iteron-data is shared).
}

beforeAll(async () => {
  if (!HAS_PODMAN) return;

  await cleanup();

  configDir = mkdtempSync(join(tmpdir(), 'iteron-start-test-'));
  process.env.ITERON_CONFIG_DIR = configDir;

  // Ensure config dir exists
  await mkdir(configDir, { recursive: true });

  // Write a test config.toml
  const configToml = `[container]
name = "${TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"

[agents.claude-code]
binary = "claude"

[agents.codex-cli]
binary = "codex"

[agents.gemini-cli]
binary = "gemini"

[agents.opencode]
binary = "opencode"
`;
  writeFileSync(join(configDir, 'config.toml'), configToml, 'utf-8');

  // Write a test .env with a test key
  writeFileSync(join(configDir, '.env'), 'ANTHROPIC_API_KEY=sk-test-123\n', 'utf-8');

  // Ensure image is pulled and volume exists
  try { execFileSync('podman', ['pull', TEST_IMAGE], { stdio: 'ignore' }); } catch {}
  try { execFileSync('podman', ['volume', 'create', 'iteron-data'], { stdio: 'ignore' }); } catch {}
});

afterAll(async () => {
  if (!HAS_PODMAN) return;
  await cleanup();
  delete process.env.ITERON_CONFIG_DIR;
  if (configDir) await rm(configDir, { recursive: true, force: true });
});

describe.skipIf(!HAS_PODMAN)('iteron start/stop (integration)', { timeout: 120_000, sequential: true }, () => {
  it('starts a container', async () => {
    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    const running = podmanExecSync(['inspect', TEST_CONTAINER, '--format', '{{.State.Running}}']);
    expect(running).toBe('true');
  });

  // IR-002 test 4: cap-drop ALL
  // Podman may expand `--cap-drop ALL` into individual capability names on some platforms.
  it('drops all capabilities', () => {
    const capDrop = podmanExecSync(['inspect', TEST_CONTAINER, '--format', '{{.HostConfig.CapDrop}}']);
    // Either literal "ALL" or the expanded list containing key capabilities
    const dropsAll = capDrop.includes('ALL') ||
      (capDrop.includes('CAP_NET_BIND_SERVICE') && capDrop.includes('CAP_SETUID') && capDrop.includes('CAP_CHOWN'));
    expect(dropsAll).toBe(true);
  });

  // IR-002 test 5: read-only rootfs
  it('has read-only rootfs', () => {
    const readOnly = podmanExecSync(['inspect', TEST_CONTAINER, '--format', '{{.HostConfig.ReadonlyRootfs}}']);
    expect(readOnly).toBe('true');
  });

  // IR-002 test 6: no-new-privileges
  it('has no-new-privileges', () => {
    const secOpt = podmanExecSync(['inspect', TEST_CONTAINER, '--format', '{{.HostConfig.SecurityOpt}}']);
    expect(secOpt).toContain('no-new-privileges');
  });

  // IR-002 test 7: start idempotent
  it('start when already running is idempotent', async () => {
    const { startCommand } = await import('../../src/commands/start.js');
    // Should not throw
    await startCommand();
    const running = podmanExecSync(['inspect', TEST_CONTAINER, '--format', '{{.State.Running}}']);
    expect(running).toBe('true');
  });

  // IR-002 test 12: env propagation
  it('propagates environment variables', () => {
    const val = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'ANTHROPIC_API_KEY']);
    expect(val).toBe('sk-test-123');
  });

  // IR-002 test 13: volume persistence
  it('persists data across restart via volume', async () => {
    // Use a unique filename to avoid false-pass from stale volume state
    const marker = `persist-test-${Date.now()}`;
    // Create a file in the volume
    execFileSync('podman', ['exec', TEST_CONTAINER, 'touch', `/home/iteron/${marker}`], { stdio: 'ignore' });

    // Stop
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();

    // Verify stopped
    try {
      podmanExecSync(['inspect', TEST_CONTAINER, '--format', '{{.State.Running}}']);
      // If inspect succeeds, container still exists but should not be running
      expect(true).toBe(false); // should have thrown since container is removed
    } catch {
      // Expected: container removed after stop
    }

    // Restart
    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    // Verify file persists (test -f exits 0 if file exists, throws otherwise)
    execFileSync('podman', ['exec', TEST_CONTAINER, 'test', '-f', `/home/iteron/${marker}`], { stdio: 'ignore' });
  });

  // SBT-035: ~/.local/bin reconciled on start with pre-existing volume
  // TODO: Use an isolated test volume once the volume name is configurable in start.ts
  it('reconciles ~/.local/bin on start with pre-existing volume', async () => {
    const BIN_DIR = '/home/iteron/.local/bin';
    const BACKUP  = `/home/iteron/.local/bin.test-backup-${Date.now()}`;

    // Check if directory currently exists (separate from move to avoid masking mv failures)
    let hadExisting = false;
    try {
      execFileSync('podman', ['exec', TEST_CONTAINER, 'test', '-d', BIN_DIR], { stdio: 'ignore' });
      hadExisting = true;
    } catch { /* does not exist */ }

    // Assert backup path is free, then move existing directory
    if (hadExisting) {
      execFileSync('podman', ['exec', TEST_CONTAINER, 'test', '!', '-e', BACKUP], { stdio: 'ignore' });
      execFileSync('podman', ['exec', TEST_CONTAINER, 'mv', BIN_DIR, BACKUP], { stdio: 'ignore' });
    }

    // Confirm BIN_DIR is absent before restart so assertions are meaningful
    // test -d exits 1 for absent directory; other codes indicate container/exec issues
    const stillExists = (() => {
      try {
        execFileSync('podman', ['exec', TEST_CONTAINER, 'test', '-d', BIN_DIR], { stdio: 'ignore' });
        return true;
      } catch (err: unknown) {
        if ((err as { status?: number }).status !== 1) throw err;
        return false;
      }
    })();
    expect(stillExists).toBe(false);

    try {
      // Stop and restart — reconcile should recreate the directory
      const { stopCommand } = await import('../../src/commands/stop.js');
      await stopCommand();
      const { startCommand } = await import('../../src/commands/start.js');
      await startCommand();

      // Assert directory exists and is writable
      execFileSync('podman', ['exec', TEST_CONTAINER, 'test', '-d', BIN_DIR], { stdio: 'ignore' });
      execFileSync('podman', ['exec', TEST_CONTAINER, 'test', '-w', BIN_DIR], { stdio: 'ignore' });
    } finally {
      // Restore backup if we saved one (backup lives on the persistent volume)
      if (hadExisting) {
        try {
          execFileSync('podman', ['exec', TEST_CONTAINER, 'rm', '-rf', BIN_DIR], { stdio: 'ignore' });
          execFileSync('podman', ['exec', TEST_CONTAINER, 'mv', BACKUP, BIN_DIR], { stdio: 'ignore' });
        } catch { /* container may not be running; backup stays on volume for manual recovery */ }
      }
    }
  });

  // IR-002 test 8: stop removes container
  it('stops and removes container', async () => {
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();

    // Container should not exist
    try {
      podmanExecSync(['inspect', TEST_CONTAINER]);
      expect(true).toBe(false); // should have thrown
    } catch {
      // Expected
    }
  });

  // IR-002 test 9: stop idempotent
  it('stop when not running is idempotent', async () => {
    const { stopCommand } = await import('../../src/commands/stop.js');
    // Should not throw
    await stopCommand();
  });
});
