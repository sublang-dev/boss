# SPDX: SPDX Headers

## SPDX-001: Copyright Header Presence

**Given** a git-tracked file with comment syntax (excludes JSON, binaries, vendor)
**When** checking its first comment block (after shebang if present)
**Then** it shall contain `SPDX-FileCopyrightText`

## SPDX-002: License Header Presence

**Given** a git-tracked file with comment syntax (excludes JSON, binaries, vendor)
**And** one or more license files exist at project root
**When** checking its first comment block (after shebang if present)
**Then** it shall contain `SPDX-License-Identifier`

### License File Detection

Recognized patterns at project root:

- `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `COPYING`
- `LICENCE`, `LICENCE.txt` (British spelling)
- `LICENSES/` folder (REUSE convention)
