// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

// Isolated config dir for the entire suite
let configDir: string;

// Guaranteed by globalSetup (builds boss-sandbox:dev locally when unset).
const TEST_IMAGE = process.env.BOSS_TEST_IMAGE!;

beforeAll(() => {
  expect(process.env.BOSS_TEST_IMAGE, 'BOSS_TEST_IMAGE must be set by globalSetup').toBeTruthy();
  configDir = mkdtempSync(join(tmpdir(), 'boss-init-test-'));
  process.env.BOSS_CONFIG_DIR = configDir;
});

afterAll(async () => {
  delete process.env.BOSS_CONFIG_DIR;
  await rm(configDir, { recursive: true, force: true });
});

describe('boss init (integration)', { timeout: 120_000 }, () => {
  it('initializes with --yes and --image', async () => {
    // Dynamic import so BOSS_CONFIG_DIR is picked up
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ image: TEST_IMAGE, yes: true });

    // IR-002 test 10: config.toml exists with expected content
    const configPath = join(configDir, 'config.toml');
    expect(existsSync(configPath)).toBe(true);
    const configContent = readFileSync(configPath, 'utf-8');
    expect(configContent).toContain('[container]');
    expect(configContent).toContain(TEST_IMAGE);

    // IR-002 test 11: .env exists with expected keys
    const envPath = join(configDir, '.env');
    expect(existsSync(envPath)).toBe(true);
    const envContent = readFileSync(envPath, 'utf-8');
    expect(envContent).toContain('CLAUDE_CODE_OAUTH_TOKEN=');
    expect(envContent).toContain('ANTHROPIC_API_KEY=');
    expect(envContent).toContain('CODEX_API_KEY=');
    expect(envContent).toContain('GEMINI_API_KEY=');
  });

  // IR-002 test 3: idempotent
  it('second init skips completed steps', async () => {
    const { initCommand } = await import('../../src/commands/init.js');
    // Should not throw, should exit cleanly
    await initCommand({ image: TEST_IMAGE, yes: true });

    // Files should still exist and be unchanged
    const configPath = join(configDir, 'config.toml');
    expect(existsSync(configPath)).toBe(true);
  });

  it('auto-migrates legacy default image on plain init', async () => {
    const legacyToml = `[container]
name = "boss-sandbox"
image = "docker.io/library/alpine:latest"
memory = "16g"
`;
    const configPath = join(configDir, 'config.toml');
    writeFileSync(configPath, legacyToml, 'utf-8');

    // Mock DEFAULT_IMAGE to TEST_IMAGE so the pull step succeeds with
    // the locally-built CI image, while still exercising the
    // isLegacyDefault auto-migration path (force=false).
    vi.doMock('../../src/utils/config.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../src/utils/config.js')>();
      return { ...actual, DEFAULT_IMAGE: TEST_IMAGE };
    });
    vi.resetModules();

    try {
      const { initCommand } = await import('../../src/commands/init.js');
      await initCommand({ yes: true });
    } finally {
      vi.doUnmock('../../src/utils/config.js');
      vi.resetModules();
    }

    const configContent = readFileSync(configPath, 'utf-8');
    expect(configContent).toContain(TEST_IMAGE);
    expect(configContent).not.toContain('docker.io/library/alpine:latest');
  });
});
