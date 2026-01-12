# SPDX: SPDX Headers

## SPDX-001: Copyright Header Presence

While the file is git-tracked with comment syntax (excludes JSON, binaries, vendor), when checking its first comment block (after shebang if present), the file shall contain `SPDX-FileCopyrightText`.

## SPDX-002: License Header Presence

While the file is git-tracked with comment syntax (excludes JSON, binaries, vendor) and one or more license files exist at project root, when checking its first comment block (after shebang if present), the file shall contain `SPDX-License-Identifier`.

### License File Detection

Recognized patterns at project root:

- `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `COPYING`
- `LICENCE`, `LICENCE.txt` (British spelling)
- `LICENSES/` folder (REUSE convention)
