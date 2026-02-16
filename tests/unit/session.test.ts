// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect } from 'vitest';
import {
  buildSessionName,
  parseSessionName,
  validateSessionToken,
} from '../../src/utils/session.js';

describe('buildSessionName', () => {
  it('joins command and location with delimiter', () => {
    expect(buildSessionName('bash', '~')).toBe('bash@~');
  });
});

describe('parseSessionName', () => {
  it('parses standard command@location names', () => {
    expect(parseSessionName('claude@myproject')).toEqual({
      command: 'claude',
      location: 'myproject',
    });
  });

  it('splits on last delimiter for defensive parsing', () => {
    expect(parseSessionName('foo@bar@ws')).toEqual({
      command: 'foo@bar',
      location: 'ws',
    });
  });

  it('falls back to home location when delimiter is absent', () => {
    expect(parseSessionName('orphan')).toEqual({
      command: 'orphan',
      location: '~',
    });
  });
});

describe('validateSessionToken', () => {
  it('rejects reserved delimiter', () => {
    expect(validateSessionToken('bad@name', 'Command name')).toContain('"@"');
  });

  it('accepts valid token', () => {
    expect(validateSessionToken('good-name', 'Command name')).toBeNull();
  });
});
