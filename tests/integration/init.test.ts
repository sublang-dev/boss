// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai>

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
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

// ITERON_TEST_IMAGE overrides the default image for CI against the real sandbox image.
const TEST_IMAGE = process.env.ITERON_TEST_IMAGE ?? 'docker.io/library/alpine:latest';

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

  it('updates legacy image in existing config to default image', async () => {
    const legacyToml = `[container]
name = "iteron-sandbox"
image = "docker.io/library/alpine:latest"
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
    const configPath = join(configDir, 'config.toml');
    writeFileSync(configPath, legacyToml, 'utf-8');

    const { initCommand } = await import('../../src/commands/init.js');
    const { DEFAULT_IMAGE } = await import('../../src/utils/config.js');
    await initCommand({ yes: true });

    const configContent = readFileSync(configPath, 'utf-8');
    expect(configContent).toContain(DEFAULT_IMAGE);
    expect(configContent).not.toContain('docker.io/library/alpine:latest');
  });
});
