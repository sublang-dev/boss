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
  it('defaultConfig includes auth section with SSH off', async () => {
    const { defaultConfig } = await import('../../src/utils/config.js');
    const config = defaultConfig();
    expect(config.auth).toBeDefined();
    expect(config.auth!.profile).toBe('local');
    expect(config.auth!.ssh).toBeDefined();
    expect(config.auth!.ssh!.mode).toBe('off');
    expect(config.auth!.ssh!.keyfile).toBe('~/.ssh/id_ed25519');
  });

  it('readConfig parses [auth] and [auth.ssh] sections', async () => {
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
    expect(config.auth).toBeDefined();
    expect(config.auth!.profile).toBe('local');
    expect(config.auth!.ssh!.mode).toBe('keyfile');
    expect(config.auth!.ssh!.keyfile).toBe('~/.ssh/id_rsa');
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
    expect(config.auth!.ssh!.keyfile).toBe('~/.ssh/id_ed25519');
  });
});

describe('resolveSshKeyPath', () => {
  it('returns null when auth is undefined', async () => {
    const { resolveSshKeyPath } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPath({ container: {} as never, agents: {} });
    expect(result).toBeNull();
  });

  it('returns null when mode is off', async () => {
    const { resolveSshKeyPath } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPath({
      container: {} as never,
      agents: {},
      auth: { profile: 'local', ssh: { mode: 'off' } },
    });
    expect(result).toBeNull();
  });

  it('expands ~ in keyfile path', async () => {
    const { resolveSshKeyPath } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPath({
      container: {} as never,
      agents: {},
      auth: { profile: 'local', ssh: { mode: 'keyfile', keyfile: '~/.ssh/id_ed25519' } },
    });
    expect(result).toBe(join(homedir(), '.ssh', 'id_ed25519'));
  });

  it('uses default keyfile when keyfile is omitted', async () => {
    const { resolveSshKeyPath } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPath({
      container: {} as never,
      agents: {},
      auth: { profile: 'local', ssh: { mode: 'keyfile' } },
    });
    expect(result).toBe(join(homedir(), '.ssh', 'id_ed25519'));
  });

  it('resolves absolute path as-is', async () => {
    const { resolveSshKeyPath } = await import('../../src/utils/config.js');
    const result = resolveSshKeyPath({
      container: {} as never,
      agents: {},
      auth: { profile: 'local', ssh: { mode: 'keyfile', keyfile: '/tmp/my-key' } },
    });
    expect(result).toBe('/tmp/my-key');
  });
});
