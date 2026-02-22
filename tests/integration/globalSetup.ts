// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/**
 * Vitest global setup for integration tests.
 * Runs once before all integration test files.
 * If BOSS_TEST_IMAGE is not set (local run), builds boss-sandbox:dev.
 *
 * Env flags:
 *   BOSS_TEST_IMAGE      — override the image (CI sets this); skips build entirely
 *   BOSS_TEST_IMAGE_TAR  — pre-saved image tar (CI sets this); skips export
 *   BOSS_FORCE_BUILD     — rebuild even if boss-sandbox:dev already exists locally
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';

let createdTar = '';

export async function setup(): Promise<void> {
  if (process.env.BOSS_TEST_IMAGE) return;

  // Integration tests call `podman` directly — fail early if it isn't functional.
  try {
    execFileSync('podman', ['info'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'Podman is not installed or not functional. ' +
      'Integration tests require Podman (Docker is not sufficient).',
    );
  }

  const IMAGE = 'boss-sandbox:dev';
  const forceRebuild = ['1', 'true'].includes(
    (process.env.BOSS_FORCE_BUILD ?? '').toLowerCase(),
  );

  let imageExists = false;
  if (!forceRebuild) {
    try {
      execFileSync('podman', ['image', 'exists', IMAGE], { stdio: 'ignore' });
      imageExists = true;
    } catch {
      // image not found — will build
    }
  }

  if (!imageExists) {
    execFileSync('bash', ['scripts/build-image.sh'], {
      stdio: 'inherit',
      timeout: 600_000,
    });
  }

  process.env.BOSS_TEST_IMAGE = IMAGE;

  // On native Linux, auth tests redirect XDG_DATA_HOME which moves
  // rootless Podman's graphRoot to an empty temp dir.  Export the image
  // to a tar so ensureImageLoaded() can reload it into redirected stores.
  // macOS uses a Podman VM whose storage is immune to host XDG changes.
  if (process.platform === 'linux' && !process.env.BOSS_TEST_IMAGE_TAR) {
    const tar = join(mkdtempSync(join(tmpdir(), 'boss-test-')), 'image.tar');
    execFileSync('podman', ['save', '-o', tar, IMAGE], {
      stdio: 'ignore',
      timeout: 120_000,
    });
    process.env.BOSS_TEST_IMAGE_TAR = tar;
    createdTar = tar;
  }
}

export async function teardown(): Promise<void> {
  if (createdTar) {
    try { unlinkSync(createdTar); } catch {}
    try { rmdirSync(dirname(createdTar)); } catch {}
  }
}
