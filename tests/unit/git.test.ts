// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai>

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { findGitRoot } from '../../src/utils/git.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'iteron-git-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe('findGitRoot', () => {
  it('finds git root from repo directory', () => {
    // The IterOn project itself is a git repo — use it.
    const root = findGitRoot(__dirname);
    expect(root).toBeTruthy();
    // Root should contain package.json
    expect(root).toMatch(/IterOn$/);
  });

  it('returns null from a temp dir without .git', () => {
    const dir = makeTempDir();
    const result = findGitRoot(dir);
    expect(result).toBeNull();
  });

  it('finds root from a nested subdirectory', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, '.git'));
    const nested = join(dir, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });
    const result = findGitRoot(nested);
    expect(result).toBe(dir);
  });
});
