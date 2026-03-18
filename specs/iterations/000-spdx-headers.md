<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2025 SubLang International <https://sublang.ai> -->

# IR-000: SPDX Headers

## Goal

Add SPDX headers (license and copyright info) to applicable files.

## Deliverables

- [x] Add SPDX headers to applicable files missing them
- [x] Document header format (was dev/style.md; canonical format examples in [task 4 below](#tasks); migrating to LIC package per [IR-010](010-adopt-spex-scaffold.md) task 4)

## Tasks

1. **Detect license file(s)** at project root; skip license line if absent
   - Single license: `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `COPYING`
   - Named variants: `LICENSE-CONTENT`, `LICENSE-APACHE`, etc.
   - British spelling: `LICENCE`, `LICENCE.txt`
   - Multiple licenses: `LICENSES/` folder (REUSE convention)

2. **Identify applicable files** according to the license(s): git-tracked or `git add`-able files with comment syntax. Excludes:
   - No comment syntax: e.g., JSON, binaries
   - Config: e.g., `.gitignore`, `.editorconfig`, `**/settings.json`, `AGENTS.md`, `.github/workflows/ci.yml`, lock files
   - Generated/vendor: e.g., `dist/`, `node_modules/`
   - License/legal documents

3. **Add headers** in the first comment block (after shebang if present), using appropriate comment syntax per file type

4. **Document format** in a dev spec (was dev/style.md; migrating to LIC package per [IR-010](010-adopt-spex-scaffold.md) task 4) according to the license(s). E.g.:

   > **Source code** (including specs):
   >
   > ```typescript
   > // SPDX-License-Identifier: Apache-2.0
   > // SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
   > ```
   >
   > ```markdown
   > <!-- SPDX-License-Identifier: Apache-2.0 -->
   > <!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
   > ```
   >
   > **Contents** (README, docs, blogs, etc.):
   >
   > ```markdown
   > <!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
   > <!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
   > ```

## Acceptance Criteria

- All source files have SPDX-FileCopyrightText header ([SPDX-001](../items/test/spdx-headers.md#spdx-001-copyright-header-presence))
- Files have SPDX-License-Identifier if a license file exists ([SPDX-002](../items/test/spdx-headers.md#spdx-002-license-header-presence))
