// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai>

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Isolated config dir for the entire suite
let configDir: string;

function podmanAvailable(): boolean {
  try {
    execFileSync('podman', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const HAS_PODMAN = podmanAvailable();

// Use a small, fast image for integration tests
const TEST_IMAGE = 'docker.io/library/alpine:latest';

beforeAll(() => {
  configDir = mkdtempSync(join(tmpdir(), 'iteron-init-test-'));
  process.env.ITERON_CONFIG_DIR = configDir;
});

afterAll(async () => {
  delete process.env.ITERON_CONFIG_DIR;
  await rm(configDir, { recursive: true, force: true });
});

describe.skipIf(!HAS_PODMAN)('iteron init (integration)', { timeout: 120_000 }, () => {
  it('initializes with --yes and --image', async () => {
    // Dynamic import so ITERON_CONFIG_DIR is picked up
    const { initCommand } = await import('../../src/commands/init.js');
    await initCommand({ image: TEST_IMAGE, yes: true });

    // IR-002 test 10: config.toml exists with expected content
    const configPath = join(configDir, 'config.toml');
    expect(existsSync(configPath)).toBe(true);
    const configContent = readFileSync(configPath, 'utf-8');
    expect(configContent).toContain('[container]');
    expect(configContent).toContain('[agents.claude-code]');
    expect(configContent).toContain('binary = "claude"');
    expect(configContent).toContain(TEST_IMAGE);

    // IR-002 test 11: .env exists with expected keys
    const envPath = join(configDir, '.env');
    expect(existsSync(envPath)).toBe(true);
    const envContent = readFileSync(envPath, 'utf-8');
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
});
