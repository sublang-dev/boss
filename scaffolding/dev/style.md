# STYLE: Authoring Conventions

This component defines naming and formatting conventions for specifications and tests, per [DR-000](../decisions/000-initial-specs-structure.md#dr-000-initial-specs-structure).

## Specification Format

### STYLE-001

Each specification file shall be named `<kebab-case-component>.md`.

### STYLE-002

Each item ID shall follow `<COMP>-NNN` format (e.g., AUTH-001, CICD-017) as a markdown heading for anchor linking.

### STYLE-003

Each item shall be self-contained and not rely on surrounding section headings for context.

### STYLE-004

Item IDs shall not be modified once committed; new items shall use higher IDs.

## Test Format

### STYLE-005

Each test file shall be named `<kebab-case-feature>.md`.

### STYLE-006

Each test case ID shall follow `<FEAT>-NNN` format (e.g., SPDX-001, AUTH-012) as a markdown heading for anchor linking.

### STYLE-007

Each test case shall use Given/When/Then (GWT) format per [META-002](../user/meta.md#meta-002) and be self-contained.

### STYLE-008

Test case IDs shall not be modified once committed; new cases shall use higher IDs.

## Cross-References

### STYLE-009

All cross-references shall use relative links with anchors (e.g., `[STYLE-001](style.md#style-001)`).

### STYLE-010

Iterations shall cite relevant specs under dev/ or user/, and corresponding tests.

### STYLE-011

Specs under dev/ and user/ shall cite decisions when the spec derives from them.

### STYLE-012

Tests shall not cite iterations; the reference direction is iterations → tests, not backwards.
