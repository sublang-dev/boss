// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai>

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
      'claude-code', 'codex-cli', 'gemini-cli', 'opencode',
    ]);
    expect(config.agents['claude-code'].binary).toBe('claude');
    expect(config.agents['codex-cli'].binary).toBe('codex');
    expect(config.agents['gemini-cli'].binary).toBe('gemini');
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
    expect(config.agents['claude-code'].binary).toBe('claude');
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
});

describe('writeEnvTemplate', () => {
  it('creates .env with expected keys', async () => {
    const { writeEnvTemplate } = await import('../../src/utils/config.js');
    const created = await writeEnvTemplate();
    expect(created).toBe(true);

    const envFile = join(tmpDir, '.env');
    expect(existsSync(envFile)).toBe(true);

    const content = readFileSync(envFile, 'utf-8');
    expect(content).toContain('ANTHROPIC_API_KEY=');
    expect(content).toContain('CODEX_API_KEY=');
    expect(content).toContain('GEMINI_API_KEY=');
  });

  it('is idempotent (returns false on second call)', async () => {
    const { writeEnvTemplate } = await import('../../src/utils/config.js');
    await writeEnvTemplate();
    const second = await writeEnvTemplate();
    expect(second).toBe(false);
  });
});
