// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

let tmpDir: string;
const origEnv = process.env.ITERON_CONFIG_DIR;

beforeEach(() => {
  vi.resetModules();
  tmpDir = mkdtempSync(join(tmpdir(), 'iteron-test-'));
  process.env.ITERON_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  if (origEnv === undefined) {
    delete process.env.ITERON_CONFIG_DIR;
  } else {
    process.env.ITERON_CONFIG_DIR = origEnv;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

describe('defaultConfig', () => {
  it('returns default image when no custom image', async () => {
    const { defaultConfig, DEFAULT_IMAGE } = await import('../../src/utils/config.js');
    const config = defaultConfig();
    expect(config.container.image).toBe(DEFAULT_IMAGE);
    expect(config.container.name).toBe('iteron-sandbox');
    expect(config.container.memory).toBe('16g');
  });

  it('uses custom image when provided', async () => {
    const { defaultConfig } = await import('../../src/utils/config.js');
    const config = defaultConfig('my-custom:image');
    expect(config.container.image).toBe('my-custom:image');
  });

  it('includes all four agents', async () => {
    const { defaultConfig } = await import('../../src/utils/config.js');
    const config = defaultConfig();
    expect(Object.keys(config.agents)).toEqual([
      'claude', 'codex', 'gemini', 'opencode',
    ]);
    expect(config.agents['claude'].binary).toBe('claude');
    expect(config.agents['codex'].binary).toBe('codex');
    expect(config.agents['gemini'].binary).toBe('gemini');
    expect(config.agents['opencode'].binary).toBe('opencode');
  });
});

describe('writeConfig / readConfig', () => {
  it('round-trips config through TOML', async () => {
    const { writeConfig, readConfig } = await import('../../src/utils/config.js');
    const created = await writeConfig();
    expect(created).toBe(true);

    const config = await readConfig();
    expect(config.container.name).toBe('iteron-sandbox');
    expect(config.container.memory).toBe('16g');
    expect(config.agents['claude'].binary).toBe('claude');
  });

  it('writeConfig is idempotent (returns false on second call)', async () => {
    const { writeConfig } = await import('../../src/utils/config.js');
    await writeConfig();
    const second = await writeConfig();
    expect(second).toBe(false);
  });

  it('writeConfig stores custom image', async () => {
    const { writeConfig, readConfig } = await import('../../src/utils/config.js');
    await writeConfig('alpine:latest');
    const config = await readConfig();
    expect(config.container.image).toBe('alpine:latest');
  });

  it('readConfig throws when config is missing', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    await expect(readConfig()).rejects.toThrow(/Config not found/);
  });

  it('readConfig migrates legacy agent keys to canonical names', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    const legacyToml = `[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang-dev/iteron-sandbox:latest"
memory = "16g"

[agents.claude-code]
binary = "claude"

[agents.codex-cli]
binary = "codex"

[agents.gemini-cli]
binary = "gemini"

[agents.opencode]
binary = "opencode"
`;
    writeFileSync(join(tmpDir, 'config.toml'), legacyToml, 'utf-8');
    const config = await readConfig();
    expect(Object.keys(config.agents)).toEqual(
      expect.arrayContaining(['claude', 'codex', 'gemini', 'opencode']),
    );
    expect(config.agents['claude'].binary).toBe('claude');
    expect(config.agents['codex'].binary).toBe('codex');
    expect(config.agents['gemini'].binary).toBe('gemini');
    expect(config.agents['claude-code' as string]).toBeUndefined();
    expect(config.agents['codex-cli' as string]).toBeUndefined();
    expect(config.agents['gemini-cli' as string]).toBeUndefined();
  });

  it('readConfig preserves canonical keys when both legacy and canonical exist', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    // Edge case: config has both claude-code and claude (user partially migrated)
    const mixedToml = `[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang-dev/iteron-sandbox:latest"
memory = "16g"

[agents.claude-code]
binary = "old-binary"

[agents.claude]
binary = "claude"
`;
    writeFileSync(join(tmpDir, 'config.toml'), mixedToml, 'utf-8');
    const config = await readConfig();
    // Canonical key wins; legacy key left as-is (not overwritten)
    expect(config.agents['claude'].binary).toBe('claude');
  });

  it('readConfig rejects agent names containing @', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    const badToml = `[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang-dev/iteron-sandbox:latest"
memory = "16g"

[agents."bad@agent"]
binary = "bad"
`;
    writeFileSync(join(tmpDir, 'config.toml'), badToml, 'utf-8');
    await expect(readConfig()).rejects.toThrow(/Agent name must not contain "@"/);
  });
});

describe('reconcileConfigImage', () => {
  it('updates legacy default image to the desired image', async () => {
    const { writeConfig, reconcileConfigImage, readConfig, DEFAULT_IMAGE, LEGACY_DEFAULT_IMAGE } = await import('../../src/utils/config.js');
    await writeConfig(LEGACY_DEFAULT_IMAGE);

    const updated = await reconcileConfigImage(DEFAULT_IMAGE);
    expect(updated).toBe(true);

    const config = await readConfig();
    expect(config.container.image).toBe(DEFAULT_IMAGE);
  });

  it('does not update custom image unless forced', async () => {
    const { writeConfig, reconcileConfigImage, readConfig, DEFAULT_IMAGE } = await import('../../src/utils/config.js');
    await writeConfig('my-custom:image');

    const updated = await reconcileConfigImage(DEFAULT_IMAGE);
    expect(updated).toBe(false);

    const config = await readConfig();
    expect(config.container.image).toBe('my-custom:image');
  });

  it('updates custom image when forced', async () => {
    const { writeConfig, reconcileConfigImage, readConfig } = await import('../../src/utils/config.js');
    await writeConfig('my-custom:image');

    const updated = await reconcileConfigImage('ghcr.io/sublang-dev/iteron-sandbox:canary', { force: true });
    expect(updated).toBe(true);

    const config = await readConfig();
    expect(config.container.image).toBe('ghcr.io/sublang-dev/iteron-sandbox:canary');
  });
});

describe('writeEnvTemplate', () => {
  it('creates .env with expected keys', async () => {
    const { writeEnvTemplate } = await import('../../src/utils/config.js');
    const created = await writeEnvTemplate();
    expect(created).toBe(true);

    const envFile = join(tmpDir, '.env');
    expect(existsSync(envFile)).toBe(true);

    const content = readFileSync(envFile, 'utf-8');
    expect(content).toContain('CLAUDE_CODE_OAUTH_TOKEN=');
    expect(content).toContain('ANTHROPIC_API_KEY=');
    expect(content).toContain('CODEX_API_KEY=');
    expect(content).toContain('GEMINI_API_KEY=');
    expect(content).toContain('MOONSHOT_API_KEY=');
  });

  it('is idempotent (returns false on second call)', async () => {
    const { writeEnvTemplate } = await import('../../src/utils/config.js');
    await writeEnvTemplate();
    const second = await writeEnvTemplate();
    expect(second).toBe(false);
  });
});

describe('auth config (DR-003)', () => {
  it('defaultConfig includes auth section with SSH off and keyfiles array', async () => {
    const { defaultConfig } = await import('../../src/utils/config.js');
    const config = defaultConfig();
    expect(config.auth).toBeDefined();
    expect(config.auth!.profile).toBe('local');
    expect(config.auth!.ssh).toBeDefined();
    expect(config.auth!.ssh!.mode).toBe('off');
    expect(config.auth!.ssh!.keyfiles).toEqual(['~/.ssh/id_ed25519']);
    expect(config.auth!.ssh!.keyfile).toBeUndefined();
  });

  it('readConfig parses [auth.ssh] with keyfiles array', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    const toml = `[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang-dev/iteron-sandbox:latest"
memory = "16g"

[agents.claude]
binary = "claude"

[auth]
profile = "local"

[auth.ssh]
mode = "keyfile"
keyfiles = ["~/.ssh/id_rsa", "~/.ssh/id_ed25519"]
`;
    writeFileSync(join(tmpDir, 'config.toml'), toml, 'utf-8');
    const config = await readConfig();
    expect(config.auth).toBeDefined();
    expect(config.auth!.profile).toBe('local');
    expect(config.auth!.ssh!.mode).toBe('keyfile');
    expect(config.auth!.ssh!.keyfiles).toEqual(['~/.ssh/id_rsa', '~/.ssh/id_ed25519']);
  });

  it('readConfig migrates legacy keyfile to keyfiles array', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    const toml = `[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang-dev/iteron-sandbox:latest"
memory = "16g"

[agents.claude]
binary = "claude"

[auth]
profile = "local"

[auth.ssh]
mode = "keyfile"
keyfile = "~/.ssh/id_rsa"
`;
    writeFileSync(join(tmpDir, 'config.toml'), toml, 'utf-8');
    const config = await readConfig();
    expect(config.auth!.ssh!.keyfiles).toEqual(['~/.ssh/id_rsa']);
    expect(config.auth!.ssh!.keyfile).toBeUndefined();
  });

  it('readConfig rejects empty keyfiles array when mode=keyfile', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    const toml = `[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang-dev/iteron-sandbox:latest"
memory = "16g"

[agents.claude]
binary = "claude"

[auth]
profile = "local"

[auth.ssh]
mode = "keyfile"
keyfiles = []
`;
    writeFileSync(join(tmpDir, 'config.toml'), toml, 'utf-8');
    await expect(readConfig()).rejects.toThrow(/keyfiles must be a non-empty array/);
  });

  it('readConfig handles missing [auth] for backward compat', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    const toml = `[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang-dev/iteron-sandbox:latest"
memory = "16g"

[agents.claude]
binary = "claude"
`;
    writeFileSync(join(tmpDir, 'config.toml'), toml, 'utf-8');
    const config = await readConfig();
    // auth is undefined — no crash
    expect(config.auth).toBeUndefined();
  });

  it('writeConfig round-trips auth section through TOML', async () => {
    const { writeConfig, readConfig } = await import('../../src/utils/config.js');
    await writeConfig();
    const config = await readConfig();
    expect(config.auth!.profile).toBe('local');
    expect(config.auth!.ssh!.mode).toBe('off');
    expect(config.auth!.ssh!.keyfiles).toEqual(['~/.ssh/id_ed25519']);
  });

  it('readConfig rejects unsupported auth profile', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    const toml = `[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang-dev/iteron-sandbox:latest"
memory = "16g"

[agents.claude]
binary = "claude"

[auth]
profile = "aws"
`;
    writeFileSync(join(tmpDir, 'config.toml'), toml, 'utf-8');
    await expect(readConfig()).rejects.toThrow(/Unsupported auth profile "aws"/);
  });

  it('readConfig rejects invalid auth.ssh.mode', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    const toml = `[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang-dev/iteron-sandbox:latest"
memory = "16g"

[agents.claude]
binary = "claude"

[auth]
profile = "local"

[auth.ssh]
mode = "agent-forwarding"
`;
    writeFileSync(join(tmpDir, 'config.toml'), toml, 'utf-8');
    await expect(readConfig()).rejects.toThrow(/Invalid \[auth\.ssh\] mode "agent-forwarding"/);
  });

  it('readConfig rejects [auth.ssh] with missing mode', async () => {
    const { readConfig } = await import('../../src/utils/config.js');
    const toml = `[container]
name = "iteron-sandbox"
image = "ghcr.io/sublang-dev/iteron-sandbox:latest"
memory = "16g"

[agents.claude]
binary = "claude"

[auth]
profile = "local"

[auth.ssh]
keyfile = "~/.ssh/id_rsa"
`;
    writeFileSync(join(tmpDir, 'config.toml'), toml, 'utf-8');
    await expect(readConfig()).rejects.toThrow(/Missing required \[auth\.ssh\] mode/);
  });
});

describe('resolveSshKeyPaths', () => {
  it('returns empty array when auth is undefined', async () => {
    const { resolveSshKeyPaths } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPaths({ container: {} as never, agents: {} });
    expect(result).toEqual([]);
  });

  it('returns empty array when mode is off', async () => {
    const { resolveSshKeyPaths } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPaths({
      container: {} as never,
      agents: {},
      auth: { profile: 'local', ssh: { mode: 'off' } },
    });
    expect(result).toEqual([]);
  });

  it('expands ~ in keyfiles paths', async () => {
    const { resolveSshKeyPaths } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPaths({
      container: {} as never,
      agents: {},
      auth: { profile: 'local', ssh: { mode: 'keyfile', keyfiles: ['~/.ssh/id_ed25519', '~/.ssh/id_rsa'] } },
    });
    expect(result).toEqual([
      join(homedir(), '.ssh', 'id_ed25519'),
      join(homedir(), '.ssh', 'id_rsa'),
    ]);
  });

  it('falls back to legacy keyfile when keyfiles is absent', async () => {
    const { resolveSshKeyPaths } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPaths({
      container: {} as never,
      agents: {},
      auth: { profile: 'local', ssh: { mode: 'keyfile', keyfile: '~/.ssh/id_rsa' } },
    });
    expect(result).toEqual([join(homedir(), '.ssh', 'id_rsa')]);
  });

  it('uses default when both keyfiles and keyfile are omitted', async () => {
    const { resolveSshKeyPaths } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPaths({
      container: {} as never,
      agents: {},
      auth: { profile: 'local', ssh: { mode: 'keyfile' } },
    });
    expect(result).toEqual([join(homedir(), '.ssh', 'id_ed25519')]);
  });

  it('resolves absolute paths as-is', async () => {
    const { resolveSshKeyPaths } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPaths({
      container: {} as never,
      agents: {},
      auth: { profile: 'local', ssh: { mode: 'keyfile', keyfiles: ['/tmp/my-key', '/opt/keys/deploy'] } },
    });
    expect(result).toEqual(['/tmp/my-key', '/opt/keys/deploy']);
  });
});

describe('uniqueSshKeyNames', () => {
  it('uses basenames when all are unique', async () => {
    const { uniqueSshKeyNames } = await import('../../src/utils/config.js');
    const result = uniqueSshKeyNames(['/home/user/.ssh/id_ed25519', '/home/user/.ssh/id_rsa']);
    expect(result.get('/home/user/.ssh/id_ed25519')).toBe('id_ed25519');
    expect(result.get('/home/user/.ssh/id_rsa')).toBe('id_rsa');
  });

  it('prefixes parent dir name when basenames collide', async () => {
    const { uniqueSshKeyNames } = await import('../../src/utils/config.js');
    const result = uniqueSshKeyNames(['/home/user/github/id_ed25519', '/home/user/gitlab/id_ed25519']);
    expect(result.get('/home/user/github/id_ed25519')).toBe('github_id_ed25519');
    expect(result.get('/home/user/gitlab/id_ed25519')).toBe('gitlab_id_ed25519');
  });

  it('handles mix of unique and duplicate basenames', async () => {
    const { uniqueSshKeyNames } = await import('../../src/utils/config.js');
    const result = uniqueSshKeyNames([
      '/home/user/github/id_ed25519',
      '/home/user/gitlab/id_ed25519',
      '/home/user/.ssh/id_rsa',
    ]);
    expect(result.get('/home/user/github/id_ed25519')).toBe('github_id_ed25519');
    expect(result.get('/home/user/gitlab/id_ed25519')).toBe('gitlab_id_ed25519');
    expect(result.get('/home/user/.ssh/id_rsa')).toBe('id_rsa');
  });

  it('appends suffix when parent dir names also collide', async () => {
    const { uniqueSshKeyNames } = await import('../../src/utils/config.js');
    const result = uniqueSshKeyNames([
      '/a/work/id_ed25519',
      '/b/work/id_ed25519',
    ]);
    const names = [...result.values()];
    // Both must be unique
    expect(new Set(names).size).toBe(2);
    // First gets work_id_ed25519, second gets work_id_ed25519_2
    expect(result.get('/a/work/id_ed25519')).toBe('work_id_ed25519');
    expect(result.get('/b/work/id_ed25519')).toBe('work_id_ed25519_2');
  });
});
