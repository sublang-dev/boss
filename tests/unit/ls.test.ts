// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai>

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseSessions, formatUptime, formatTree } from '../../src/commands/ls.js';

describe('parseSessions', () => {
  const fixedNow = 1700000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty array for empty output', () => {
    expect(parseSessions('')).toEqual([]);
    expect(parseSessions('  ')).toEqual([]);
  });

  it('parses single session', () => {
    const output = `claude-code:myproject 1 ${fixedNow - 3600}`;
    const result = parseSessions(output);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      session: 'claude-code:myproject',
      command: 'claude-code',
      location: 'myproject',
      attached: true,
      uptime_seconds: 3600,
    });
  });

  it('parses multiple sessions', () => {
    const output = [
      `claude-code:~ 1 ${fixedNow - 8100}`,
      `bash:myproject 0 ${fixedNow - 2700}`,
      `gemini-cli:backend 0 ${fixedNow - 600}`,
    ].join('\n');
    const result = parseSessions(output);
    expect(result).toHaveLength(3);
    expect(result[0].command).toBe('claude-code');
    expect(result[0].location).toBe('~');
    expect(result[0].attached).toBe(true);
    expect(result[1].command).toBe('bash');
    expect(result[1].location).toBe('myproject');
    expect(result[1].attached).toBe(false);
    expect(result[2].command).toBe('gemini-cli');
    expect(result[2].location).toBe('backend');
    expect(result[2].attached).toBe(false);
  });

  it('handles session name without colon', () => {
    const output = `orphan 0 ${fixedNow - 60}`;
    const result = parseSessions(output);
    expect(result[0].command).toBe('orphan');
    expect(result[0].location).toBe('~');
  });
});

describe('formatUptime', () => {
  it('formats seconds', () => {
    expect(formatUptime(30)).toBe('30s');
  });

  it('formats minutes', () => {
    expect(formatUptime(2700)).toBe('45m');
  });

  it('formats hours', () => {
    expect(formatUptime(7200)).toBe('2h');
  });

  it('formats hours and minutes', () => {
    expect(formatUptime(8100)).toBe('2h 15m');
  });

  it('formats zero', () => {
    expect(formatUptime(0)).toBe('0s');
  });
});

describe('formatTree', () => {
  it('groups sessions by location', () => {
    const sessions = [
      { session: 'claude-code:~', command: 'claude-code', location: '~', attached: true, uptime_seconds: 8100 },
      { session: 'bash:~', command: 'bash', location: '~', attached: false, uptime_seconds: 2700 },
      { session: 'claude-code:myproject', command: 'claude-code', location: 'myproject', attached: false, uptime_seconds: 5400 },
    ];
    const output = formatTree(sessions, []);
    expect(output).toContain('~/ (home)');
    expect(output).toContain('  claude-code (attached, 2h 15m)');
    expect(output).toContain('  bash (detached, 45m)');
    expect(output).toContain('myproject/');
    expect(output).toContain('  claude-code (detached, 1h 30m)');
  });

  it('shows home before other workspaces', () => {
    const sessions = [
      { session: 'bash:myproject', command: 'bash', location: 'myproject', attached: false, uptime_seconds: 60 },
      { session: 'bash:~', command: 'bash', location: '~', attached: false, uptime_seconds: 60 },
    ];
    const output = formatTree(sessions, []);
    const lines = output.split('\n');
    const homeIdx = lines.findIndex((l) => l.includes('~/ (home)'));
    const projIdx = lines.findIndex((l) => l.includes('myproject/'));
    expect(homeIdx).toBeLessThan(projIdx);
  });

  it('includes workspace dirs without sessions', () => {
    const output = formatTree([], ['backend']);
    expect(output).toContain('backend/');
  });

  it('merges sessions and workspace dirs', () => {
    const sessions = [
      { session: 'bash:backend', command: 'bash', location: 'backend', attached: false, uptime_seconds: 60 },
    ];
    const output = formatTree(sessions, ['backend', 'frontend']);
    expect(output).toContain('backend/');
    expect(output).toContain('  bash (detached, 1m)');
    expect(output).toContain('frontend/');
  });
});
