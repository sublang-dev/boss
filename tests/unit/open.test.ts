// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect } from 'vitest';
import { extractPassthroughArgs, resolveArgs } from '../../src/commands/open.js';
import { validateWorkspace } from '../../src/utils/config.js';
import type { IteronConfig } from '../../src/utils/config.js';
import { homedir } from 'node:os';

const agents: IteronConfig['agents'] = {
  claude: { binary: 'claude' },
  codex: { binary: 'codex' },
  gemini: { binary: 'gemini' },
  opencode: { binary: 'opencode' },
};

describe('resolveArgs', () => {
  it('0 args → shell in home', () => {
    const result = resolveArgs([], agents);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('1 arg ~ → shell in home', () => {
    const result = resolveArgs(['~'], agents);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('1 arg shell-expanded ~ → shell in home', () => {
    // Shell expands unquoted ~ to $HOME before CLI sees it
    const result = resolveArgs([homedir()], agents);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('2 args shell-expanded ~ and agent → agent in home', () => {
    const result = resolveArgs([homedir(), 'claude'], agents);
    expect(result.binary).toBe('claude');
    expect(result.sessionName).toBe('claude@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('1 arg workspace → shell in workspace', () => {
    const result = resolveArgs(['myproject'], agents);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@myproject');
    expect(result.workDir).toBe('/home/iteron/myproject');
  });

  it('1 arg matching agent name → shell in workspace (no agent lookup)', () => {
    // With workspace-first grammar, a single arg is always a workspace
    const result = resolveArgs(['claude'], agents);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@claude');
    expect(result.workDir).toBe('/home/iteron/claude');
  });

  it('2 args old agent-first order → no swap, workspace=agent name', () => {
    // Regression: ensure no legacy rewriting of agent-first form
    const result = resolveArgs(['claude', 'myproject'], agents);
    expect(result.binary).toBe('myproject');
    expect(result.sessionName).toBe('myproject@claude');
    expect(result.workDir).toBe('/home/iteron/claude');
  });

  it('2 args with ~ and known agent → agent in home', () => {
    const result = resolveArgs(['~', 'claude'], agents);
    expect(result.binary).toBe('claude');
    expect(result.sessionName).toBe('claude@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('2 args workspace and known agent → agent in workspace', () => {
    const result = resolveArgs(['myproject', 'claude'], agents);
    expect(result.binary).toBe('claude');
    expect(result.sessionName).toBe('claude@myproject');
    expect(result.workDir).toBe('/home/iteron/myproject');
  });

  it('2 args workspace and unknown command → raw command in workspace', () => {
    const result = resolveArgs(['myproject', 'vim'], agents);
    expect(result.binary).toBe('vim');
    expect(result.sessionName).toBe('vim@myproject');
    expect(result.workDir).toBe('/home/iteron/myproject');
  });

  it('2 args ~ and unknown command → raw command in home', () => {
    const result = resolveArgs(['~', 'vim'], agents);
    expect(result.binary).toBe('vim');
    expect(result.sessionName).toBe('vim@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('rejects traversal segment as workspace (1-arg)', () => {
    expect(() => resolveArgs(['..'], agents)).toThrow('traversal');
  });

  it('rejects traversal segment as workspace (2-arg)', () => {
    expect(() => resolveArgs(['..', 'vim'], agents)).toThrow('traversal');
  });

  it('rejects absolute path as workspace', () => {
    expect(() => resolveArgs(['/etc'], agents)).toThrow('absolute');
  });

  it('rejects path with separators as workspace', () => {
    expect(() => resolveArgs(['foo/bar'], agents)).toThrow('separator');
    expect(() => resolveArgs(['a/b', 'vim'], agents)).toThrow('separator');
  });

  it('rejects command containing @ (session delimiter)', () => {
    expect(() => resolveArgs(['ws', 'foo@bar'], agents)).toThrow('@');
  });

  it('rejects configured agent name containing @', () => {
    const badAgents = { ...agents, 'bad@agent': { binary: 'bad' } };
    expect(() => resolveArgs(['~', 'bad@agent'], badAgents)).toThrow('@');
  });
});

describe('validateWorkspace', () => {
  it('returns null for valid workspace names', () => {
    expect(validateWorkspace('myproject')).toBeNull();
    expect(validateWorkspace('backend')).toBeNull();
    expect(validateWorkspace('my-project_2')).toBeNull();
  });

  it('returns null for ~ (home shorthand)', () => {
    expect(validateWorkspace('~')).toBeNull();
  });

  it('returns null for empty string (caller responsibility)', () => {
    expect(validateWorkspace('')).toBeNull();
  });

  it('rejects ..', () => {
    expect(validateWorkspace('..')).toContain('traversal');
  });

  it('rejects .', () => {
    expect(validateWorkspace('.')).toContain('traversal');
  });

  it('rejects absolute paths', () => {
    expect(validateWorkspace('/etc')).toContain('absolute');
  });

  it('rejects paths with separators', () => {
    expect(validateWorkspace('foo/bar')).toContain('separator');
    expect(validateWorkspace('foo\\bar')).toContain('separator');
  });

  it('rejects @ (session delimiter)', () => {
    expect(validateWorkspace('ws@name')).toContain('@');
  });
});

describe('extractPassthroughArgs', () => {
  it('returns empty array when no separator is present', () => {
    expect(extractPassthroughArgs(['myproject', 'claude'])).toEqual([]);
  });

  it('returns everything after the first separator', () => {
    expect(extractPassthroughArgs(['myproject', 'claude', '--', '--resume'])).toEqual(['--resume']);
  });

  it('preserves subsequent -- tokens as payload', () => {
    expect(
      extractPassthroughArgs(['myproject', 'claude', '--', '--resume', '--', 'literal']),
    ).toEqual(['--resume', '--', 'literal']);
  });

  it('returns empty array when separator is the final token', () => {
    expect(extractPassthroughArgs(['claude', '--'])).toEqual([]);
  });
});
