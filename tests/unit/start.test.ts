// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it, expect } from 'vitest';
import { parseMiseReconcileState, formatMiseWarning } from '../../src/commands/start.js';

describe('parseMiseReconcileState', () => {
  it('returns null when status is missing', () => {
    expect(parseMiseReconcileState('fingerprint=abc123\n')).toBeNull();
  });

  it('parses state fields and converts should_warn/updated_at_epoch', () => {
    const parsed = parseMiseReconcileState([
      'version=1',
      'status=error',
      'fingerprint=deadbeef',
      'failed_step=install_locked',
      'error_class=network',
      'error_message=Could not resolve host',
      'should_warn=1',
      'updated_at_epoch=1700000000',
    ].join('\n'));

    expect(parsed).toEqual({
      status: 'error',
      fingerprint: 'deadbeef',
      failedStep: 'install_locked',
      errorClass: 'network',
      errorMessage: 'Could not resolve host',
      shouldWarn: true,
      updatedAtEpoch: 1700000000,
    });
  });

  it('treats should_warn=0 as false', () => {
    const parsed = parseMiseReconcileState('status=error\nshould_warn=0\n');
    expect(parsed?.shouldWarn).toBe(false);
  });

  it('leaves shouldWarn undefined when should_warn is missing', () => {
    const parsed = parseMiseReconcileState('status=error\n');
    expect(parsed?.shouldWarn).toBeUndefined();
  });
});

describe('formatMiseWarning', () => {
  it('returns null for non-error status without hint metadata', () => {
    expect(formatMiseWarning({ status: 'ok', shouldWarn: true })).toBeNull();
  });

  it('returns null when error is deduped', () => {
    expect(formatMiseWarning({
      status: 'error',
      shouldWarn: false,
      failedStep: 'install_locked',
      errorClass: 'network',
      errorMessage: 'Could not resolve host',
    })).toBeNull();
  });

  it('formats a warning when an error should be surfaced', () => {
    expect(formatMiseWarning({
      status: 'error',
      shouldWarn: true,
      failedStep: 'install_locked',
      errorClass: 'network',
      errorMessage: 'Could not resolve host',
    })).toBe('Warning: mise reconciliation failed (install_locked/network): Could not resolve host');
  });

  it('formats a hint when user lockfile is missing', () => {
    expect(formatMiseWarning({
      status: 'ok',
      shouldWarn: true,
      failedStep: 'user_lock_missing',
      errorClass: 'lockfile',
      errorMessage: 'run mise lock',
    })).toBe('Warning: mise reconciliation hint (user_lock_missing/lockfile): run mise lock');
  });
});
