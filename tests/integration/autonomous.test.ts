// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, mkdir } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';

// Requires the real sandbox image (agents must be installed).
const TEST_IMAGE = process.env.ITERON_TEST_IMAGE ?? '';
const HAS_SANDBOX_IMAGE = !!TEST_IMAGE;
const TEST_CONTAINER = 'iteron-test-sandbox';

const SETUP_FIXTURE = join(import.meta.dirname, '..', 'setup-fixture.sh');

/** Regex patterns that indicate an agent paused for permission approval. */
const PERMISSION_PATTERNS = /\[Y\/n\]|\bAllow\b|\bapprove\b|permission to |Do you want to|trust this/i;

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

/** At least one agent auth key must be set for autonomous tests to be meaningful. */
const AUTH_KEYS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CODEX_API_KEY', 'GEMINI_API_KEY', 'MOONSHOT_API_KEY'];
const HAS_AUTH = AUTH_KEYS.some((k) => !!process.env[k]);

/** Flip to false once Codex / Gemini / OpenCode API keys are funded. */
const SKIP_UNPAID_AGENTS = true;
const SECRET_VALUES = new Set<string>();

function registerSecretValue(raw: string | undefined): void {
  if (!raw) return;
  const trimmed = raw.trim();
  if (!trimmed) return;

  SECRET_VALUES.add(trimmed);

  const quoted = trimmed.match(/^(['"])(.*)\1$/);
  if (quoted && quoted[2]) SECRET_VALUES.add(quoted[2]);
}

for (const k of AUTH_KEYS) {
  registerSecretValue(process.env[k]);
}

function podmanExecSync(args: string[], options?: { timeout?: number }): string {
  return execFileSync('podman', args, {
    encoding: 'utf-8',
    timeout: options?.timeout,
  }).trim();
}

function containerExec(cmd: string[], options?: { timeout?: number }): string {
  return podmanExecSync(['exec', TEST_CONTAINER, ...cmd], options);
}

/**
 * Run an agent command inside the container, capturing combined stdout+stderr.
 * Returns { exitCode, log }.
 */
function runAgent(
  workspace: string,
  agentCmd: string,
  timeout = 120_000,
): { exitCode: number; log: string } {
  const result = spawnSync(
    'podman',
    ['exec', TEST_CONTAINER, 'bash', '-c', `cd /home/iteron/${workspace} && ${agentCmd}`],
    { encoding: 'utf-8', timeout },
  );
  return {
    exitCode: result.status ?? 1,
    log: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  };
}

/** Replace known secret values with '***' (mirrors CI ::add-mask::). */
function redactSecrets(text: string): string {
  let result = text;
  for (const secret of SECRET_VALUES) {
    result = result.replaceAll(secret, '***');
  }
  return result;
}

/** Build a safe diagnostic string from agent output (no raw secrets). */
function diagnoseAgent(exitCode: number, log: string): string {
  const hints: string[] = [`exit=${exitCode}`, `log_bytes=${log.length}`];
  if (log.match(/auth|token|api.key|unauthorized|credential|log.?in/i)) hints.push('hint:auth-error');
  if (log.match(/not found|command not found|no such file/i)) hints.push('hint:missing-binary');
  if (log.match(/timeout|timed out|ETIMEDOUT/i)) hints.push('hint:timeout');
  if (log.match(/permission|denied|EPERM|EACCES/i)) hints.push('hint:permission-denied');
  if (log.match(/rate.limit|429|quota/i)) hints.push('hint:rate-limit');
  if (log.match(/model.*not|unknown model|invalid model/i)) hints.push('hint:bad-model');
  if (log.match(/connect|ECONNREFUSED|network/i)) hints.push('hint:network-error');
  const firstLine = redactSecrets(log.trim().split('\n')[0]?.slice(0, 200) ?? '');
  if (firstLine) hints.push(`first_line: ${firstLine}`);
  return hints.join(', ');
}

/** Dump redacted agent log to stderr for local/CI diagnosis. */
function dumpAgentLog(label: string, log: string): void {
  const redacted = redactSecrets(log);
  const lines = redacted.split('\n');
  const tail = lines.length > 80 ? lines.slice(-80) : lines;
  console.error(`\n──── ${label} (last ${tail.length}/${lines.length} lines) ────`);
  console.error(tail.join('\n'));
  console.error(`──── end ${label} ────\n`);
}

/** Create the buggy test fixture in a container workspace. */
function setupFixture(workspace: string): void {
  execFileSync('bash', [SETUP_FIXTURE, TEST_CONTAINER, workspace], {
    encoding: 'utf-8',
    timeout: 30_000,
  });
}

/** Verify npm test passes after an agent fix. */
function verifyNpmTest(workspace: string): { exitCode: number; output: string } {
  try {
    const stdout = containerExec(
      ['bash', '-c', `cd /home/iteron/${workspace} && npm test`],
      { timeout: 30_000 },
    );
    return { exitCode: 0, output: stdout };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: e.status ?? 1,
      output: `${e.stdout ?? ''}\n${e.stderr ?? ''}`,
    };
  }
}

async function cleanup(): Promise<void> {
  try { execFileSync('podman', ['stop', '-t', '0', TEST_CONTAINER], { stdio: 'ignore' }); } catch {}
  try { execFileSync('podman', ['rm', '-f', TEST_CONTAINER], { stdio: 'ignore' }); } catch {}
}

describe('autonomous log redaction helpers', () => {
  it('masks registered secret values', () => {
    const secret = '__ITERON_TEST_SECRET_0123456789__';
    SECRET_VALUES.add(secret);
    try {
      expect(redactSecrets(`prefix ${secret} suffix`)).toBe('prefix *** suffix');
    } finally {
      SECRET_VALUES.delete(secret);
    }
  });
});

// Skip when no sandbox image, no Podman, or no auth keys — these tests need real agents.
describe.skipIf(!HAS_PODMAN || !HAS_SANDBOX_IMAGE || !HAS_AUTH)(
  'IR-006 autonomous execution (integration)',
  { timeout: 300_000, sequential: true },
  () => {
    beforeAll(async () => {
      await cleanup();

      configDir = mkdtempSync(join(tmpdir(), 'iteron-autonomous-test-'));
      process.env.ITERON_CONFIG_DIR = configDir;

      await mkdir(configDir, { recursive: true });

      const configToml = `[container]
name = "${TEST_CONTAINER}"
image = "${TEST_IMAGE}"
memory = "2g"

[agents.claude]
binary = "claude"

[agents.codex]
binary = "codex"

[agents.gemini]
binary = "gemini"

[agents.opencode]
binary = "opencode"
`;
      writeFileSync(join(configDir, 'config.toml'), configToml, 'utf-8');

      // .env must supply valid auth tokens; tests rely on IR-005 headless auth.
      // Start from ~/.iteron/.env as baseline, then overlay process.env values
      // so CI-injected secrets and local credentials merge correctly.
      const envFile = join(configDir, '.env');
      const envMap = new Map<string, string>();

      // Baseline: copy from ~/.iteron/.env if it exists.
      const realEnv = join(process.env.HOME ?? '', '.iteron', '.env');
      try {
        const envContent = execFileSync('cat', [realEnv], { encoding: 'utf-8' });
        for (const line of envContent.split('\n')) {
          const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
          if (match) envMap.set(match[1], match[2]);
        }
      } catch { /* no baseline file */ }

      // Overlay: process.env values take precedence (CI injects secrets this way).
      const envKeys = [
        'CLAUDE_CODE_OAUTH_TOKEN',
        'ANTHROPIC_API_KEY',
        'CODEX_API_KEY',
        'GEMINI_API_KEY',
        'MOONSHOT_API_KEY',
      ];
      for (const k of envKeys) {
        if (process.env[k]) envMap.set(k, process.env[k]!);
      }

      for (const k of AUTH_KEYS) {
        registerSecretValue(envMap.get(k));
      }

      if (envMap.size > 0) {
        writeFileSync(envFile, [...envMap].map(([k, v]) => `${k}=${v}`).join('\n') + '\n', 'utf-8');
      } else {
        writeFileSync(envFile, '# no auth tokens available\n', 'utf-8');
      }
      chmodSync(envFile, 0o600);

      // Best-effort cleanup of secrets on unexpected exit (won't fire on SIGKILL).
      process.on('exit', () => {
        try { rmSync(configDir, { recursive: true, force: true }); } catch {}
      });

      // Remove stale volume so image autonomy configs propagate to a fresh one.
      try { execFileSync('podman', ['volume', 'rm', '-f', 'iteron-data'], { stdio: 'ignore' }); } catch {}
      try { execFileSync('podman', ['volume', 'create', 'iteron-data'], { stdio: 'ignore' }); } catch {}

      const { startCommand } = await import('../../src/commands/start.js');
      await startCommand();
    });

    afterAll(async () => {
      await cleanup();
      try { execFileSync('podman', ['volume', 'rm', '-f', 'iteron-data'], { stdio: 'ignore' }); } catch {}
      delete process.env.ITERON_CONFIG_DIR;
      if (configDir) await rm(configDir, { recursive: true, force: true });
    });

    // ── Verification #1: fixture pre-check ──────────────────────────────

    it('fixture npm test fails before fix', () => {
      setupFixture('test-precheck');

      const result = verifyNpmTest('test-precheck');
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toMatch(/AssertionError|AssertionError/i);

      // Cleanup
      try { containerExec(['rm', '-rf', '/home/iteron/test-precheck']); } catch {}
    });

    // ── Verification #2–3: Claude Code ──────────────────────────────────

    let ccLog = '';

    it('Claude Code autonomously fixes the bug', () => {
      setupFixture('test-cc');

      const agent = runAgent(
        'test-cc',
        'claude -p "Fix the bug in src/calc.js so that npm test passes. Do not modify tests/test_calc.js." --output-format json',
      );
      ccLog = agent.log;
      dumpAgentLog('claude', agent.log);
      expect(agent.exitCode, diagnoseAgent(agent.exitCode, agent.log)).toBe(0);

      const result = verifyNpmTest('test-cc');
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('PASS');
    });

    it('Claude Code log has no permission prompts', () => {
      expect(ccLog).not.toMatch(PERMISSION_PATTERNS);
    });

    // ── Verification #4–5: Codex CLI ────────────────────────────────────

    let codexLog = '';

    it.skipIf(SKIP_UNPAID_AGENTS)('Codex CLI autonomously fixes the bug', () => {
      setupFixture('test-codex');

      const agent = runAgent(
        'test-codex',
        'codex exec "Fix the bug in src/calc.js so that npm test passes. Do not modify tests/test_calc.js."',
      );
      codexLog = agent.log;
      dumpAgentLog('codex', agent.log);
      expect(agent.exitCode, diagnoseAgent(agent.exitCode, agent.log)).toBe(0);

      const result = verifyNpmTest('test-codex');
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('PASS');
    });

    it.skipIf(SKIP_UNPAID_AGENTS)('Codex CLI log has no permission prompts', () => {
      expect(codexLog).not.toMatch(PERMISSION_PATTERNS);
    });

    // ── Verification #6–7: Gemini CLI ───────────────────────────────────

    let geminiLog = '';

    it.skipIf(SKIP_UNPAID_AGENTS)('Gemini CLI autonomously fixes the bug', () => {
      setupFixture('test-gemini');

      const agent = runAgent(
        'test-gemini',
        'gemini --yolo -p "Fix the bug in src/calc.js so that npm test passes. Do not modify tests/test_calc.js."',
      );
      geminiLog = agent.log;
      dumpAgentLog('gemini', agent.log);
      expect(agent.exitCode, diagnoseAgent(agent.exitCode, agent.log)).toBe(0);

      const result = verifyNpmTest('test-gemini');
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('PASS');
    });

    it.skipIf(SKIP_UNPAID_AGENTS)('Gemini CLI log has no permission prompts', () => {
      expect(geminiLog).not.toMatch(PERMISSION_PATTERNS);
    });

    // ── Verification #8–9: OpenCode ─────────────────────────────────────

    let opencodeLog = '';

    it.skipIf(SKIP_UNPAID_AGENTS)('OpenCode autonomously fixes the bug', () => {
      setupFixture('test-opencode');

      const agent = runAgent(
        'test-opencode',
        'opencode run -m moonshotai-cn/kimi-k2.5 "Fix the bug in src/calc.js so that npm test passes. Do not modify tests/test_calc.js."',
      );
      opencodeLog = agent.log;
      dumpAgentLog('opencode', agent.log);
      expect(agent.exitCode, diagnoseAgent(agent.exitCode, agent.log)).toBe(0);

      const result = verifyNpmTest('test-opencode');
      dumpAgentLog('opencode npm-test', result.output);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('PASS');
    });

    it.skipIf(SKIP_UNPAID_AGENTS)('OpenCode log has no permission prompts', () => {
      expect(opencodeLog).not.toMatch(PERMISSION_PATTERNS);
    });
  },
);
