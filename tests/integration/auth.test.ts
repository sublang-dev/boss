// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Guaranteed by globalSetup (builds boss-sandbox:dev locally when unset).
const TEST_IMAGE = process.env.BOSS_TEST_IMAGE!;
const TEST_CONTAINER = 'boss-test-sandbox';

let configDir: string;
let xdgDataDir: string;
const origXdg = process.env.XDG_DATA_HOME;

function podmanExecSync(args: string[]): string {
  return execFileSync('podman', args, { encoding: 'utf-8' }).trim();
}

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

/**
 * Ensure TEST_IMAGE is available in the current Podman storage.
 *
 * On native Linux, redirecting XDG_DATA_HOME moves rootless Podman's
 * graphRoot to an empty temp dir.  CI builds a commit-scoped image and
 * exports it to a tar (BOSS_TEST_IMAGE_TAR).  Load it into the
 * redirected store so `podman run` can find it.
 */
const TEST_IMAGE_TAR = process.env.BOSS_TEST_IMAGE_TAR || '';

function ensureImageLoaded(): void {
  if (!TEST_IMAGE_TAR) return;
  try {
    execFileSync('podman', ['image', 'exists', TEST_IMAGE], { stdio: 'ignore' });
  } catch {
    execFileSync('podman', ['load', '-i', TEST_IMAGE_TAR], { stdio: 'ignore', timeout: 120_000 });
  }
}

describe('IR-005 headless auth (integration)', { timeout: 120_000, sequential: true }, () => {
  beforeAll(async () => {
    await cleanup();

    configDir = mkdtempSync(join(tmpdir(), 'boss-auth-test-'));
    xdgDataDir = mkdtempSync(join(tmpdir(), 'boss-xdg-test-'));
    process.env.BOSS_CONFIG_DIR = configDir;

    await mkdir(configDir, { recursive: true });

    const configToml = `[container]
name = "${TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"
`;
    writeFileSync(join(configDir, 'config.toml'), configToml, 'utf-8');

    // Write .env with CLAUDE_CODE_OAUTH_TOKEN
    writeFileSync(
      join(configDir, '.env'),
      'CLAUDE_CODE_OAUTH_TOKEN=oauth-test-token\nANTHROPIC_API_KEY=sk-test-456\n',
      'utf-8',
    );

    // Ensure volume exists (image is guaranteed by globalSetup)
    try { execFileSync('podman', ['volume', 'create', 'boss-data'], { stdio: 'ignore' }); } catch {}
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    delete process.env.BOSS_CONFIG_DIR;
    if (origXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = origXdg;
    }
    if (configDir) await rm(configDir, { recursive: true, force: true });
    if (xdgDataDir) forceRmTempDir(xdgDataDir);
  }, 120_000);

  // IR-005 test 1: CLAUDE_CODE_OAUTH_TOKEN propagates to container
  it('propagates CLAUDE_CODE_OAUTH_TOKEN to container', async () => {
    // No OpenCode auth file — skip mount
    process.env.XDG_DATA_HOME = xdgDataDir;
    ensureImageLoaded();

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    const val = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'CLAUDE_CODE_OAUTH_TOKEN']);
    expect(val).toBe('oauth-test-token');
  });

  // IR-005 test 2: NO_BROWSER=true is set in container
  it('has NO_BROWSER=true in container', () => {
    const val = podmanExecSync(['exec', TEST_CONTAINER, 'printenv', 'NO_BROWSER']);
    expect(val).toBe('true');
  });

  // IR-005 test 3: hasCompletedOnboarding is true
  it('has hasCompletedOnboarding in claude.json', () => {
    const content = podmanExecSync(['exec', TEST_CONTAINER, 'cat', '/home/boss/.claude.json']);
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
    ensureImageLoaded();

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    // Verify file is actually readable by container user
    const content = podmanExecSync(['exec', TEST_CONTAINER, 'cat', '/home/boss/.local/share/opencode/auth.json']);
    expect(content).toContain('oc-test');

    // Clean up for next test
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });

  // IR-005 test 5: OpenCode mount skipped when host file absent
  it('skips opencode mount when auth.json absent', async () => {
    // Point XDG_DATA_HOME to empty dir (no opencode/auth.json)
    const emptyXdg = mkdtempSync(join(tmpdir(), 'boss-xdg-empty-'));
    process.env.XDG_DATA_HOME = emptyXdg;
    ensureImageLoaded();

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    const mounts = podmanExecSync(['inspect', TEST_CONTAINER, '--format', '{{json .Mounts}}']);
    expect(mounts).not.toContain('auth.json');

    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();

    forceRmTempDir(emptyXdg);
  });

  // IR-005 test 6 (spec verification #3): no auth → non-zero exit, auth error (not onboarding)
  it('exits with auth error when no credentials provided', async () => {
    // Write an empty .env (no tokens, no API keys)
    writeFileSync(join(configDir, '.env'), '# empty — no auth\n', 'utf-8');
    process.env.XDG_DATA_HOME = xdgDataDir;
    ensureImageLoaded();

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    let exitCode: number | null = null;
    let combined = '';
    try {
      execFileSync('podman', ['exec', TEST_CONTAINER, 'claude', '-p', 'echo hello'], {
        encoding: 'utf-8',
        timeout: 30_000,
      });
      exitCode = 0;
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      exitCode = e.status ?? 1;
      combined = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
    }

    expect(exitCode).not.toBe(0);
    // Should show an auth-related error, not an onboarding prompt
    const output = combined.toLowerCase();
    expect(output).toMatch(/auth|token|api.key|unauthorized|credential|log.?in/);
    expect(output).not.toContain('onboarding');

    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });
});

// ---------------------------------------------------------------------------
// DR-003 §2: SSH key mount tests
// ---------------------------------------------------------------------------

const SSH_TEST_CONTAINER = 'boss-test-ssh';

let sshConfigDir: string;
let sshXdgDir: string;
let sshKeyDir: string;

describe('DR-003 SSH key mount (integration)', { timeout: 120_000, sequential: true }, () => {
  async function sshCleanup(): Promise<void> {
    try { execFileSync('podman', ['stop', '-t', '0', SSH_TEST_CONTAINER], { stdio: 'ignore' }); } catch {}
    try { execFileSync('podman', ['rm', '-f', SSH_TEST_CONTAINER], { stdio: 'ignore' }); } catch {}
  }

  beforeAll(async () => {
    // Clear module cache so config.ts re-evaluates CONFIG_DIR with
    // the updated BOSS_CONFIG_DIR (stale from the IR-005 suite).
    vi.resetModules();

    await sshCleanup();

    sshConfigDir = mkdtempSync(join(tmpdir(), 'boss-ssh-test-'));
    sshXdgDir = mkdtempSync(join(tmpdir(), 'boss-ssh-xdg-'));
    sshKeyDir = mkdtempSync(join(tmpdir(), 'boss-ssh-keys-'));
    process.env.BOSS_CONFIG_DIR = sshConfigDir;
    process.env.XDG_DATA_HOME = sshXdgDir;
    ensureImageLoaded();

    // Create a fake SSH key file
    await writeFile(join(sshKeyDir, 'id_ed25519'), 'fake-ssh-private-key-content\n', { mode: 0o600 });

    // Write .env (required by startCommand)
    writeFileSync(join(sshConfigDir, '.env'), 'ANTHROPIC_API_KEY=sk-test-ssh\n', 'utf-8');

    // Ensure volume exists (image is guaranteed by globalSetup)
    try { execFileSync('podman', ['volume', 'create', 'boss-data'], { stdio: 'ignore' }); } catch {}
  }, 120_000);

  afterAll(async () => {
    await sshCleanup();
    delete process.env.BOSS_CONFIG_DIR;
    if (origXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = origXdg;
    }
    if (sshConfigDir) await rm(sshConfigDir, { recursive: true, force: true });
    if (sshXdgDir) forceRmTempDir(sshXdgDir);
    if (sshKeyDir) await rm(sshKeyDir, { recursive: true, force: true });
  }, 120_000);

  it('mounts SSH key and writes ssh config when mode=keyfile', async () => {
    const keyPath = join(sshKeyDir, 'id_ed25519');
    const configToml = `[container]
name = "${SSH_TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"

[auth]
profile = "local"

[auth.ssh]
mode = "keyfile"
keyfiles = ["${keyPath}"]
`;
    writeFileSync(join(sshConfigDir, 'config.toml'), configToml, 'utf-8');

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    // Verify key is injected and readable at /run/boss/ssh/id_ed25519
    const keyContent = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/run/boss/ssh/id_ed25519']);
    expect(keyContent).toContain('fake-ssh-private-key-content');

    // Verify key has SSH-compatible permissions (0600, owned by boss)
    const keyPerms = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'stat', '-c', '%a:%U', '/run/boss/ssh/id_ed25519']);
    expect(keyPerms).toBe('600:boss');

    // Verify managed include file contains IdentityFile directive
    const sshConfig = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/home/boss/.ssh/config.d/boss.conf']);
    expect(sshConfig).toContain('IdentityFile /run/boss/ssh/id_ed25519');

    // Verify managed include file has restrictive permissions
    const perms = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'stat', '-c', '%a', '/home/boss/.ssh/config.d/boss.conf']);
    expect(perms).toBe('600');
  });

  it('SSH key tmpfs visible in podman inspect', () => {
    const tmpfs = podmanExecSync(['inspect', SSH_TEST_CONTAINER, '--format', '{{json .HostConfig.Tmpfs}}']);
    expect(tmpfs).toContain('/run/boss/ssh');
  });

  it('stops container after keyfile test', async () => {
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });

  // Regression test for keyfile → off transition (self-contained)
  it('cleans stale SSH config when switching from keyfile to off', async () => {
    const keyPath = join(sshKeyDir, 'id_ed25519');

    // Phase 1: start with keyfile to create managed config on volume
    const keyfileToml = `[container]
name = "${SSH_TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"

[auth]
profile = "local"

[auth.ssh]
mode = "keyfile"
keyfiles = ["${keyPath}"]
`;
    writeFileSync(join(sshConfigDir, 'config.toml'), keyfileToml, 'utf-8');

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    // Confirm managed config was created
    execFileSync('podman', ['exec', SSH_TEST_CONTAINER, 'test', '-f',
      '/home/boss/.ssh/config.d/boss.conf'], { stdio: 'ignore' });

    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();

    // Phase 2: switch to mode=off and restart
    const offToml = `[container]
name = "${SSH_TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"

[auth]
profile = "local"

[auth.ssh]
mode = "off"
`;
    writeFileSync(join(sshConfigDir, 'config.toml'), offToml, 'utf-8');

    await startCommand();

    // The managed include file must not exist (cleaned up on start)
    let exists = true;
    try {
      execFileSync('podman', ['exec', SSH_TEST_CONTAINER, 'test', '-f',
        '/home/boss/.ssh/config.d/boss.conf'], { stdio: 'ignore' });
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);

    await stopCommand();
  });

  it('skips SSH mount when mode=off', async () => {
    const configToml = `[container]
name = "${SSH_TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"

[auth]
profile = "local"

[auth.ssh]
mode = "off"
`;
    writeFileSync(join(sshConfigDir, 'config.toml'), configToml, 'utf-8');

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    const tmpfs = podmanExecSync(['inspect', SSH_TEST_CONTAINER, '--format', '{{json .HostConfig.Tmpfs}}']);
    expect(tmpfs).not.toContain('/run/boss/ssh');
  });

  it('stops container after mode=off test', async () => {
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });

  it('skips SSH mount when [auth.ssh] absent', async () => {
    const configToml = `[container]
name = "${SSH_TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"
`;
    writeFileSync(join(sshConfigDir, 'config.toml'), configToml, 'utf-8');

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    const tmpfs = podmanExecSync(['inspect', SSH_TEST_CONTAINER, '--format', '{{json .HostConfig.Tmpfs}}']);
    expect(tmpfs).not.toContain('/run/boss/ssh');
  });

  it('stops container after absent-auth test', async () => {
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });

  it('warns and skips mount when keyfile does not exist on host', async () => {
    const configToml = `[container]
name = "${SSH_TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"

[auth]
profile = "local"

[auth.ssh]
mode = "keyfile"
keyfiles = ["/nonexistent/path/id_ed25519"]
`;
    writeFileSync(join(sshConfigDir, 'config.toml'), configToml, 'utf-8');

    // Capture stderr for warning
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found on host'));
    warnSpy.mockRestore();

    const tmpfs = podmanExecSync(['inspect', SSH_TEST_CONTAINER, '--format', '{{json .HostConfig.Tmpfs}}']);
    expect(tmpfs).not.toContain('/run/boss/ssh');

    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });

  // Multi-key injection test
  it('mounts multiple SSH keys and writes all IdentityFile directives', async () => {
    const keyPath1 = join(sshKeyDir, 'id_ed25519');
    // Create a second key
    await writeFile(join(sshKeyDir, 'id_rsa'), 'fake-rsa-key-content\n', { mode: 0o600 });
    const keyPath2 = join(sshKeyDir, 'id_rsa');

    const configToml = `[container]
name = "${SSH_TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"

[auth]
profile = "local"

[auth.ssh]
mode = "keyfile"
keyfiles = ["${keyPath1}", "${keyPath2}"]
`;
    writeFileSync(join(sshConfigDir, 'config.toml'), configToml, 'utf-8');

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    // Verify both keys injected
    const key1 = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/run/boss/ssh/id_ed25519']);
    expect(key1).toContain('fake-ssh-private-key-content');
    const key2 = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/run/boss/ssh/id_rsa']);
    expect(key2).toContain('fake-rsa-key-content');

    // Verify boss.conf contains both IdentityFile directives in order
    const sshConfig = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/home/boss/.ssh/config.d/boss.conf']);
    expect(sshConfig).toContain('IdentityFile /run/boss/ssh/id_ed25519');
    expect(sshConfig).toContain('IdentityFile /run/boss/ssh/id_rsa');
    // Verify order: id_ed25519 before id_rsa
    const idx1 = sshConfig.indexOf('IdentityFile /run/boss/ssh/id_ed25519');
    const idx2 = sshConfig.indexOf('IdentityFile /run/boss/ssh/id_rsa');
    expect(idx1).toBeLessThan(idx2);

    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });

  // Duplicate-basename disambiguation test
  it('disambiguates duplicate basenames with parent dir prefix', async () => {
    // Create two keys with the same basename in different directories
    const githubDir = join(sshKeyDir, 'github');
    const gitlabDir = join(sshKeyDir, 'gitlab');
    mkdirSync(githubDir, { recursive: true });
    mkdirSync(gitlabDir, { recursive: true });
    await writeFile(join(githubDir, 'id_ed25519'), 'github-key-content\n', { mode: 0o600 });
    await writeFile(join(gitlabDir, 'id_ed25519'), 'gitlab-key-content\n', { mode: 0o600 });

    const configToml = `[container]
name = "${SSH_TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"

[auth]
profile = "local"

[auth.ssh]
mode = "keyfile"
keyfiles = ["${join(githubDir, 'id_ed25519')}", "${join(gitlabDir, 'id_ed25519')}"]
`;
    writeFileSync(join(sshConfigDir, 'config.toml'), configToml, 'utf-8');

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    // Verify disambiguated filenames in container
    const key1 = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/run/boss/ssh/github_id_ed25519']);
    expect(key1).toContain('github-key-content');
    const key2 = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/run/boss/ssh/gitlab_id_ed25519']);
    expect(key2).toContain('gitlab-key-content');

    // Verify boss.conf references disambiguated names
    const sshConfig = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/home/boss/.ssh/config.d/boss.conf']);
    expect(sshConfig).toContain('IdentityFile /run/boss/ssh/github_id_ed25519');
    expect(sshConfig).toContain('IdentityFile /run/boss/ssh/gitlab_id_ed25519');

    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });

  // Partial availability test: one key exists, one doesn't
  it('mounts existing keys and warns about missing ones', async () => {
    const keyPath = join(sshKeyDir, 'id_ed25519');

    const configToml = `[container]
name = "${SSH_TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"

[auth]
profile = "local"

[auth.ssh]
mode = "keyfile"
keyfiles = ["${keyPath}", "/nonexistent/path/id_missing"]
`;
    writeFileSync(join(sshConfigDir, 'config.toml'), configToml, 'utf-8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    // Warning issued for missing key
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('/nonexistent/path/id_missing'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found on host'));
    warnSpy.mockRestore();

    // Existing key still mounted
    const keyContent = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/run/boss/ssh/id_ed25519']);
    expect(keyContent).toContain('fake-ssh-private-key-content');

    // Only one IdentityFile directive (for existing key)
    const sshConfig = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/home/boss/.ssh/config.d/boss.conf']);
    expect(sshConfig).toContain('IdentityFile /run/boss/ssh/id_ed25519');
    expect(sshConfig).not.toContain('id_missing');

    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });

  // Pre-seeded SSH config tests
  it('has pre-seeded ssh_known_hosts with GitHub and GitLab keys', async () => {
    const configToml = `[container]
name = "${SSH_TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "512m"
`;
    writeFileSync(join(sshConfigDir, 'config.toml'), configToml, 'utf-8');

    const { startCommand } = await import('../../src/commands/start.js');
    await startCommand();

    const knownHosts = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/etc/ssh/ssh_known_hosts']);
    expect(knownHosts).toContain('github.com');
    expect(knownHosts).toContain('gitlab.com');
  });

  it('has StrictHostKeyChecking and managed Include in ssh_config.d', () => {
    const sshConf = podmanExecSync(['exec', SSH_TEST_CONTAINER, 'cat', '/etc/ssh/ssh_config.d/boss.conf']);
    expect(sshConf).toContain('StrictHostKeyChecking yes');
    expect(sshConf).toContain('Include /home/boss/.ssh/config.d/*.conf');
  });

  it('stops container after sandbox-image tests', async () => {
    const { stopCommand } = await import('../../src/commands/stop.js');
    await stopCommand();
  });
});
