// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai>

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// ITERON_TEST_IMAGE overrides the default image for CI against the real sandbox image.
const TEST_IMAGE = process.env.ITERON_TEST_IMAGE ?? 'docker.io/library/alpine:latest';
const HAS_SANDBOX_IMAGE = !!process.env.ITERON_TEST_IMAGE;
const TEST_CONTAINER = 'iteron-test-sandbox';

let configDir: string;
let xdgDataDir: string;
const origXdg = process.env.XDG_DATA_HOME;

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
}

/**
 * Remove a temp dir that may contain Podman UID-remapped overlay files.
 * Rootless Podman stores container data under $XDG_DATA_HOME/containers/;
 * when tests redirect XDG_DATA_HOME to a temp dir, `podman unshare` is
 * required to enter the user namespace and delete those files.
 */
function forceRmTempDir(dir: string): void {
  try { execFileSync('podman', ['unshare', 'rm', '-rf', dir], { stdio: 'ignore' }); } catch {}
}

describe.skipIf(!HAS_PODMAN)('IR-005 headless auth (integration)', { timeout: 120_000, sequential: true }, () => {
  beforeAll(async () => {
    await cleanup();

    configDir = mkdtempSync(join(tmpdir(), 'iteron-auth-test-'));
    xdgDataDir = mkdtempSync(join(tmpdir(), 'iteron-xdg-test-'));
    process.env.ITERON_CONFIG_DIR = configDir;

    await mkdir(configDir, { recursive: true });

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

    // Write .env with CLAUDE_CODE_OAUTH_TOKEN
    writeFileSync(
      join(configDir, '.env'),
      'CLAUDE_CODE_OAUTH_TOKEN=oauth-test-token\nANTHROPIC_API_KEY=sk-test-456\n',
      'utf-8',
    );

    try { execFileSync('podman', ['pull', TEST_IMAGE], { stdio: 'ignore' }); } catch {}
    try { execFileSync('podman', ['volume', 'create', 'iteron-data'], { stdio: 'ignore' }); } catch {}
  });

  afterAll(async () => {
    await cleanup();
    delete process.env.ITERON_CONFIG_DIR;
    if (origXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = origXdg;
    }
    if (configDir) await rm(configDir, { recursive: true, force: true });
    if (xdgDataDir) forceRmTempDir(xdgDataDir);
  });

  // IR-005 test 1: CLAUDE_CODE_OAUTH_TOKEN propagates to container
  it('propagates CLAUDE_CODE_OAUTH_TOKEN to container', async () => {
    // No OpenCode auth file — skip mount
    process.env.XDG_DATA_HOME = xdgDataDir;

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    const val = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'CLAUDE_CODE_OAUTH_TOKEN']);
    expect(val).toBe('oauth-test-token');
  });

  // IR-005 test 2: NO_BROWSER=true is set in container (sandbox image only)
  it.skipIf(!HAS_SANDBOX_IMAGE)('has NO_BROWSER=true in container', () => {
    const val = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'NO_BROWSER']);
    expect(val).toBe('true');
  });

  // IR-005 test 3: hasCompletedOnboarding is true (sandbox image only)
  it.skipIf(!HAS_SANDBOX_IMAGE)('has hasCompletedOnboarding in claude.json', () => {
    const content = podmanExecSync(['exec', TEST_CONTAINER, 'cat', '/home/iteron/.claude.json']);
    const json = JSON.parse(content);
    expect(json.hasCompletedOnboarding).toBe(true);
  });

  // Stop container before OpenCode mount tests
  it('stops container for OpenCode mount tests', async () => {
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });

  // IR-005 test 4: OpenCode mount added when host file exists
  it('mounts opencode auth.json when present on host', async () => {
    // Create fake auth.json in XDG_DATA_HOME
    const opencodeDir = join(xdgDataDir, 'opencode');
    mkdirSync(opencodeDir, { recursive: true });
    writeFileSync(join(opencodeDir, 'auth.json'), '{"token":"oc-test"}', 'utf-8');
    process.env.XDG_DATA_HOME = xdgDataDir;

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    // Verify file is actually readable by container user
    const content = podmanExecSync(['exec', TEST_CONTAINER, 'cat', '/home/iteron/.local/share/opencode/auth.json']);
    expect(content).toContain('oc-test');

    // Clean up for next test
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });

  // IR-005 test 5: OpenCode mount skipped when host file absent
  it('skips opencode mount when auth.json absent', async () => {
    // Point XDG_DATA_HOME to empty dir (no opencode/auth.json)
    const emptyXdg = mkdtempSync(join(tmpdir(), 'iteron-xdg-empty-'));
    process.env.XDG_DATA_HOME = emptyXdg;

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    const mounts = podmanExecSync(['inspect', TEST_CONTAINER, '--format', '{{json .Mounts}}']);
    expect(mounts).not.toContain('auth.json');

    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();

    forceRmTempDir(emptyXdg);
  });

  // IR-005 test 6 (spec verification #3): no auth → non-zero exit, auth error (not onboarding)
  it.skipIf(!HAS_SANDBOX_IMAGE)('exits with auth error when no credentials provided', async () => {
    // Write an empty .env (no tokens, no API keys)
    writeFileSync(join(configDir, '.env'), '# empty — no auth\n', 'utf-8');
    process.env.XDG_DATA_HOME = xdgDataDir;

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    let exitCode: number | null = null;
    let stderr = '';
    try {
      execFileSync('podman', ['exec', TEST_CONTAINER, 'claude', '-p', 'echo hello'], {
        encoding: 'utf-8',
        timeout: 30_000,
      });
      exitCode = 0;
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: string };
      exitCode = e.status ?? 1;
      stderr = e.stderr ?? '';
    }

    expect(exitCode).not.toBe(0);
    // Should show an auth-related error, not an onboarding prompt
    const output = stderr.toLowerCase();
    expect(output).toMatch(/auth|token|api.key|unauthorized|credential|log.?in/);
    expect(output).not.toContain('onboarding');

    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });
});
