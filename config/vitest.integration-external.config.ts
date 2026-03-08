// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/autonomous.test.ts'],
    fileParallelism: false,
    globalSetup: ['tests/integration/globalSetup.ts'],
    hookTimeout: 120_000,
  },
});
