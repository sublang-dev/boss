// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_PATH = resolve(import.meta.dirname, '../../dist/index.js');

function run(args: string[]): string {
  return execFileSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf-8',
    timeout: 10_000,
  }).trim();
}

describe('CLI smoke tests', () => {
  it('--help exits 0 and shows usage', () => {
    const output = run(['--help']);
    expect(output).toContain('iteron');
    expect(output).toContain('open');
    expect(output).toContain('ls');
    expect(output).toContain('rm');
  });

  it('--version exits 0', () => {
    const output = run(['--version']);
    expect(output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('open --help shows argument descriptions', () => {
    const output = run(['open', '--help']);
    expect(output).toContain('workspace');
    expect(output).toContain('command');
  });

  it('ls --help shows command help', () => {
    const output = run(['ls', '--help']);
    expect(output).toContain('List workspaces and running sessions');
  });

  it('rm --help shows workspace argument', () => {
    const output = run(['rm', '--help']);
    expect(output).toContain('<workspace>');
  });

  it('unknown command exits non-zero', () => {
    expect(() => run(['nonexistent'])).toThrow();
  });
});
