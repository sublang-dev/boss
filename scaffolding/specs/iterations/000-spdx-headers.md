# IR-000: SPDX Headers

## Goal

Add SPDX headers (license and copyright info) to applicable files.

## Deliverables

- [ ] Add SPDX headers to applicable files missing them
- [ ] Document header format in [dev/style.md](../dev/style.md)

## Tasks

1. **Detect license file(s)** at project root; skip license line if absent
   - Single license: `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `COPYING`
   - Named variants: `LICENSE-CONTENT`, `LICENSE-APACHE`, etc.
   - British spelling: `LICENCE`, `LICENCE.txt`
   - Multiple licenses: `LICENSES/` folder (REUSE convention)

2. **Identify applicable files**: git-tracked files with comment syntax. Excludes:
   - No comment syntax: JSON, binaries
   - Config: `.gitignore`, `.editorconfig`, `**/settings.json`, lock files
   - Generated/vendor: `dist/`, `node_modules/`, vendor directories
   - License/legal documents

3. **Add headers** in the first comment block (after shebang if present), using appropriate comment syntax per file type

4. **Document format** in [dev/style.md](../dev/style.md). E.g.:

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
