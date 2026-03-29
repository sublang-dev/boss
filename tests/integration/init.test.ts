// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
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

    // IR-002 test 10: config.toml exists with --image persisted
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

  // LCD-55: non-rootless runtime → exit non-zero
  it('exits non-zero when runtime is not rootless', async () => {
    const podman = await import('../../src/utils/podman.js');
    const functionalSpy = vi.spyOn(podman, 'isPodmanFunctional').mockResolvedValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    const { initCommand } = await import('../../src/commands/init.js');
    try {
      await initCommand({ image: TEST_IMAGE, yes: true });
    } catch {
      // Expected — mock process.exit throws
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    functionalSpy.mockRestore();
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

});
