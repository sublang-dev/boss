// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect } from 'vitest';
import { extractPassthroughArgs, resolveArgs } from '../../src/commands/open.js';
import { validateWorkspace } from '../../src/utils/config.js';
import { homedir } from 'node:os';

describe('resolveArgs', () => {
  it('0 args → shell in home', () => {
    const result = resolveArgs([]);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('1 arg ~ → shell in home', () => {
    const result = resolveArgs(['~']);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('1 arg shell-expanded ~ → shell in home', () => {
    // Shell expands unquoted ~ to $HOME before CLI sees it
    const result = resolveArgs([homedir()]);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('1 arg shell-expanded ~/ (trailing slash) → shell in home', () => {
    const result = resolveArgs([`${homedir()}/`]);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('2 args shell-expanded ~ and agent → agent in home', () => {
    const result = resolveArgs([homedir(), 'claude']);
    expect(result.binary).toBe('claude');
    expect(result.sessionName).toBe('claude@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('2 args shell-expanded ~/ (trailing slash) and agent → agent in home', () => {
    const result = resolveArgs([`${homedir()}/`, 'claude']);
    expect(result.binary).toBe('claude');
    expect(result.sessionName).toBe('claude@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('1 arg workspace → shell in workspace', () => {
    const result = resolveArgs(['myproject']);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@myproject');
    expect(result.workDir).toBe('/home/iteron/myproject');
  });

  it('1 arg matching agent name → shell in workspace (no agent lookup)', () => {
    // With workspace-first grammar, a single arg is always a workspace
    const result = resolveArgs(['claude']);
    expect(result.binary).toBe('bash');
    expect(result.sessionName).toBe('bash@claude');
    expect(result.workDir).toBe('/home/iteron/claude');
  });

  it('2 args old agent-first order → no swap, workspace=agent name', () => {
    // Regression: ensure no legacy rewriting of agent-first form
    const result = resolveArgs(['claude', 'myproject']);
    expect(result.binary).toBe('myproject');
    expect(result.sessionName).toBe('myproject@claude');
    expect(result.workDir).toBe('/home/iteron/claude');
  });

  it('2 args with ~ and known agent → agent in home', () => {
    const result = resolveArgs(['~', 'claude']);
    expect(result.binary).toBe('claude');
    expect(result.sessionName).toBe('claude@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('2 args workspace and known agent → agent in workspace', () => {
    const result = resolveArgs(['myproject', 'claude']);
    expect(result.binary).toBe('claude');
    expect(result.sessionName).toBe('claude@myproject');
    expect(result.workDir).toBe('/home/iteron/myproject');
  });

  it('2 args workspace and unknown command → raw command in workspace', () => {
    const result = resolveArgs(['myproject', 'vim']);
    expect(result.binary).toBe('vim');
    expect(result.sessionName).toBe('vim@myproject');
    expect(result.workDir).toBe('/home/iteron/myproject');
  });

  it('2 args ~ and unknown command → raw command in home', () => {
    const result = resolveArgs(['~', 'vim']);
    expect(result.binary).toBe('vim');
    expect(result.sessionName).toBe('vim@~');
    expect(result.workDir).toBe('/home/iteron');
  });

  it('rejects traversal segment as workspace (1-arg)', () => {
    expect(() => resolveArgs(['..'])).toThrow('traversal');
  });

  it('rejects traversal segment as workspace (2-arg)', () => {
    expect(() => resolveArgs(['..', 'vim'])).toThrow('traversal');
  });

  it('rejects absolute path as workspace', () => {
    expect(() => resolveArgs(['/etc'])).toThrow('absolute');
  });

  it('rejects path with separators as workspace', () => {
    expect(() => resolveArgs(['foo/bar'])).toThrow('separator');
    expect(() => resolveArgs(['a/b', 'vim'])).toThrow('separator');
  });

  it('rejects command containing @ (session delimiter)', () => {
    expect(() => resolveArgs(['ws', 'foo@bar'])).toThrow('@');
  });

  it('rejects command containing @ even if it looks like an agent', () => {
    expect(() => resolveArgs(['~', 'bad@agent'])).toThrow('@');
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
