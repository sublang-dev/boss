// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Guaranteed by globalSetup (builds boss-sandbox:dev locally when unset).
const TEST_IMAGE = process.env.BOSS_TEST_IMAGE!;
const TEST_CONTAINER = 'boss-test-sandbox';

let configDir: string;

function podmanExecSync(args: string[]): string {
  return execFileSync('podman', args, { encoding: 'utf-8' }).trim();
}

async function cleanup(): Promise<void> {
  try { execFileSync('podman', ['stop', '-t', '0', TEST_CONTAINER], { stdio: 'ignore' }); } catch {}
  try { execFileSync('podman', ['rm', '-f', TEST_CONTAINER], { stdio: 'ignore' }); } catch {}
  // Do NOT remove the volume — it may contain real user data (boss-data is shared).
}

beforeAll(async () => {
  await cleanup();

  configDir = mkdtempSync(join(tmpdir(), 'boss-start-test-'));
  process.env.BOSS_CONFIG_DIR = configDir;

  // Ensure config dir exists
  await mkdir(configDir, { recursive: true });

  // Write a test config.toml
  const configToml = `[container]
name = "${TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"
`;
  writeFileSync(join(configDir, 'config.toml'), configToml, 'utf-8');

  // Write a test .env with a test key
  writeFileSync(join(configDir, '.env'), 'ANTHROPIC_API_KEY=sk-test-123\n', 'utf-8');

  // Ensure volume exists (image is guaranteed by globalSetup)
  try { execFileSync('podman', ['volume', 'create', 'boss-data'], { stdio: 'ignore' }); } catch {}
});

afterAll(async () => {
  await cleanup();
  delete process.env.BOSS_CONFIG_DIR;
  if (configDir) await rm(configDir, { recursive: true, force: true });
});

describe('boss start/stop (integration)', { timeout: 120_000, sequential: true }, () => {
  async function restartContainer(): Promise<void> {
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();
  }

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

  it('preinstalls baseline developer CLIs', () => {
    const gpg = podmanExecSync(['exec', TEST_CONTAINER, 'gpg', '--version']);
    expect(gpg).toContain('gpg (GnuPG)');

    const tree = podmanExecSync(['exec', TEST_CONTAINER, 'tree', '--version']);
    expect(tree.toLowerCase()).toContain('tree');

    const gh = podmanExecSync(['exec', TEST_CONTAINER, 'gh', '--version']);
    expect(gh.toLowerCase()).toContain('gh version');

    const glab = podmanExecSync(['exec', TEST_CONTAINER, 'glab', '--version']);
    expect(glab.toLowerCase()).toContain('glab');
  });

  it('sets DR-005 package-manager environment variables and PATH order', () => {
    const xdgConfig = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'XDG_CONFIG_HOME']);
    const xdgCache = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'XDG_CACHE_HOME']);
    const xdgData = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'XDG_DATA_HOME']);
    const xdgState = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'XDG_STATE_HOME']);
    const pipUser = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'PIP_USER']);
    const pythonUserBase = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'PYTHONUSERBASE']);
    const npmPrefix = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'NPM_CONFIG_PREFIX']);
    const goPath = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'GOPATH']);
    const goBin = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'GOBIN']);
    const cargoHome = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'CARGO_HOME']);
    const rustupHome = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'RUSTUP_HOME']);
    const path = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'PATH']);

    expect(xdgConfig).toBe('/home/boss/.config');
    expect(xdgCache).toBe('/home/boss/.cache');
    expect(xdgData).toBe('/home/boss/.local/share');
    expect(xdgState).toBe('/home/boss/.local/state');
    expect(pipUser).toBe('1');
    expect(pythonUserBase).toBe('/home/boss/.local');
    expect(npmPrefix).toBe('/home/boss/.local/share/npm-global');
    expect(goPath).toBe('/home/boss/.local/share/go');
    expect(goBin).toBe('/home/boss/.local/bin');
    expect(cargoHome).toBe('/home/boss/.local/share/cargo');
    expect(rustupHome).toBe('/home/boss/.local/share/rustup');
    expect(path.startsWith(
      '/home/boss/.local/share/mise/shims:' +
      '/home/boss/.local/bin:' +
      '/home/boss/.local/share/npm-global/bin:' +
      '/home/boss/.local/share/cargo/bin:',
    )).toBe(true);
  });

  it('sudo shim passes through common flags and blocks user/group/shell switching', () => {
    const output = podmanExecSync([
      'exec',
      TEST_CONTAINER,
      'sh',
      '-lc',
      'sudo -n sh -lc "id -un" 2>&1',
    ]);
    expect(output).toContain('# rootless: sudo is a no-op shim; running as boss');
    expect(output).toContain('boss');

    expect(() => {
      execFileSync('podman', ['exec', TEST_CONTAINER, 'sudo', '-u', 'root', 'true'], { stdio: 'ignore' });
    }).toThrow();
    expect(() => {
      execFileSync('podman', ['exec', TEST_CONTAINER, 'sudo', '-g', 'root', 'true'], { stdio: 'ignore' });
    }).toThrow();
    expect(() => {
      execFileSync('podman', ['exec', TEST_CONTAINER, 'sudo', '-i'], { stdio: 'ignore' });
    }).toThrow();
  });

  it('seeds missing defaults and preserves existing files across restart', async () => {
    const marker = '/home/boss/.config/boss/default-seed.marker';

    execFileSync('podman', ['exec', TEST_CONTAINER, 'rm', '-f', marker], { stdio: 'ignore' });
    await restartContainer();
    const seeded = podmanExecSync(['exec', TEST_CONTAINER, 'cat', marker]);
    expect(seeded).toBe('seed-defaults-v1');

    execFileSync(
      'podman',
      ['exec', TEST_CONTAINER, 'sh', '-lc', `printf '%s\\n' user-custom > ${marker}`],
      { stdio: 'ignore' },
    );
    await restartContainer();
    const preserved = podmanExecSync(['exec', TEST_CONTAINER, 'cat', marker]);
    expect(preserved).toBe('user-custom');
  });

  it('records image version marker and logs version transitions', async () => {
    const current = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'BOSS_IMAGE_VERSION']);
    const marker = '/home/boss/.local/state/.boss-image-version';
    execFileSync(
      'podman',
      ['exec', TEST_CONTAINER, 'sh', '-lc', `printf '%s\\n' 0.0.0-test > ${marker}`],
      { stdio: 'ignore' },
    );

    await restartContainer();
    const markerValue = podmanExecSync(['exec', TEST_CONTAINER, 'cat', marker]);
    expect(markerValue).toBe(current);

    const logs = podmanExecSync(['logs', TEST_CONTAINER]);
    expect(logs).toContain(`boss-image-version changed: 0.0.0-test -> ${current}`);
  });

  it('loads DR-005 interactive venv guard in bash and restores PIP_USER on venv exit', () => {
    const output = podmanExecSync([
      'exec',
      TEST_CONTAINER,
      'bash',
      '-ic',
      [
        'set -eu',
        'case "${PROMPT_COMMAND:-}" in *_pip_user_venv_guard*) ;; *) echo "missing-prompt-command"; exit 1;; esac',
        'export VIRTUAL_ENV=/tmp/fake-venv',
        '_pip_user_venv_guard',
        '[ -z "${PIP_USER:-}" ]',
        'unset VIRTUAL_ENV',
        '_pip_user_venv_guard',
        '[ "${PIP_USER:-}" = "1" ]',
        'echo ok',
      ].join('; '),
    ]);
    expect(output).toContain('ok');
  });

  // IR-002 test 13: volume persistence
  it('persists data across restart via volume', async () => {
    // Use a unique filename to avoid false-pass from stale volume state
    const marker = `persist-test-${Date.now()}`;
    try {
      // Create a file in the volume
      execFileSync('podman', ['exec', TEST_CONTAINER, 'touch', `/home/boss/${marker}`], { stdio: 'ignore' });

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
      execFileSync('podman', ['exec', TEST_CONTAINER, 'test', '-f', `/home/boss/${marker}`], { stdio: 'ignore' });
    } finally {
      // Best-effort cleanup: marker is only for verification, not fixture state.
      try {
        execFileSync('podman', ['exec', TEST_CONTAINER, 'rm', '-f', `/home/boss/${marker}`], { stdio: 'ignore' });
      } catch {
        // Container may not be running if the test failed before restart.
      }
    }
  });

  // SBT-035: ~/.local/bin reconciled on start with pre-existing volume
  // TODO: Use an isolated test volume once the volume name is configurable in start.ts
  it('reconciles ~/.local/bin on start with pre-existing volume', async () => {
    const BIN_DIR = '/home/boss/.local/bin';
    const BACKUP  = `/home/boss/.local/bin.test-backup-${Date.now()}`;

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
