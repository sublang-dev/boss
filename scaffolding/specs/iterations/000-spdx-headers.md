# IR-000: SPDX Headers

## Goal

Add SPDX headers to all source files.

Source files: git-tracked files with comment syntax (excludes JSON, binaries, vendor). Headers go in the first comment block, after shebang if present.

## Deliverables

- [ ] Add SPDX headers to source files missing them
- [ ] Document header format in [dev/style.md](../dev/style.md)

## Tasks

1. **Detect license file(s)** at project root; skip license line if absent
   - Single license: `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `COPYING`
   - British spelling: `LICENCE`, `LICENCE.txt`
   - Multiple licenses: `LICENSES/` folder (REUSE convention)
2. **Add headers** using appropriate comment syntax per file type
3. **Document format** in [dev/style.md](../dev/style.md).
   E.g.:

   > **Code:**
   >
   > ```typescript
   > // SPDX-License-Identifier: Apache-2.0
   > // SPDX-FileCopyrightText: 2026 SubLang contributors <https://github.com/sublang-xyz>
   > ```
   >
   > **Markdown:**
   >
   > ```markdown
   > <!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
   > <!-- SPDX-FileCopyrightText: 2025 SubLang contributors <https://github.com/sublang-xyz> -->
   > ```

## Acceptance Criteria

- All source files have SPDX-FileCopyrightText header ([SPDX-001](../test/spdx-headers.md#spdx-001-copyright-header-presence))
- Files have SPDX-License-Identifier if a license file exists ([SPDX-002](../test/spdx-headers.md#spdx-002-license-header-presence))
