<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2025 SubLang International <https://github.com/sublang-xyz> -->

# STYLE: Authoring Conventions

This component defines authoring conventions, per [DR-000](../decisions/000-initial-specs-structure.md#dr-000-initial-specs-structure).

## Spec Format

### STYLE-001

Each spec file shall be named `<kebab-case-name>.md`.

### STYLE-002

Each item ID shall follow `<COMP>-NNN` format (e.g., AUTH-001, SPDX-003) as a markdown heading for anchor linking.

### STYLE-003

Each item shall use GEARS syntax per [META-001](../user/meta.md#meta-001) and be self-contained:

- No dependency on sibling or containing sections for understanding;
- May rely on its own subsections for details;
- Cross-references to other specs are allowed but the item must be understandable without reading them.

### STYLE-004

Item IDs shall not be modified once committed; new items shall use higher IDs.

## Cross-References

### STYLE-005

Cross-references to specific items shall use relative links with anchors (e.g., `[STYLE-001](style.md#style-001)`).

### STYLE-006

Iterations shall cite relevant specs.

### STYLE-007

Specs shall cite decisions when deriving from them.

### STYLE-008

Specs shall not cite iterations.

### STYLE-011

Test specs shall not be cited by other specs.

## SPDX Headers

### STYLE-009

While a file is git-tracked or `git add`-able with comment syntax (see exclusions below), when adding SPDX headers, the file shall include both `SPDX-License-Identifier` and `SPDX-FileCopyrightText` in the first comment block (after shebang if present).

#### Exclusions

- No comment syntax: JSON, binaries
- Config: `.gitignore`, `.editorconfig`, `**/settings.json`, lock files
- Generated/vendor: `dist/`, `node_modules/`, vendor directories
- Templates: `scaffolding/` (copied to user projects)
- License/legal documents

### STYLE-010

Source code files (TypeScript, JavaScript, specs) shall use Apache-2.0 headers:

```typescript
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 SubLang International <https://github.com/sublang-xyz>
```

```markdown
<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2025 SubLang International <https://github.com/sublang-xyz> -->
```
