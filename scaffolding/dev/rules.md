# RULE: Development Rules

This component defines development rules for the project.

## Git Commits

### RULE-001

The AI agent shall verify `user.name` and `user.email` are configured before committing.

### RULE-002

Each commit message shall use `<type>(<scope>)<!>: <subject>` format, where `<scope>` and `!` are optional.

### RULE-003

The commit type shall be one of: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `ci`, `build`, `perf`, or `chore`.

### RULE-004

The commit subject shall be imperative, ≤50 chars, with no trailing period.

### RULE-005

When a commit introduces a breaking change, the message shall include `!` before the colon.

### RULE-006

The commit body shall explain what/why (not how), wrap at 72 chars, and use bullets if clearer.

### RULE-007

When AI assists in authoring a commit, the message shall include a `Co-authored-by` trailer.

## Test Spec Format ([DR-000](../decisions/000-initial-specs-structure.md#dr-000-initial-specs-structure))

### RULE-008

Each test file shall be named `<kebab-case-feature>.md`.

### RULE-009

Each test case ID shall follow the format `<FEAT>-NNN` (e.g., SPDX-001, AUTH-017).

### RULE-010

Each test case ID shall be a markdown heading for anchor linking.

### RULE-011

Each test case shall use Given/When/Then (GWT) format and be self-contained.

### RULE-012

Test case IDs shall not be modified once commited; new cases shall use higher IDs.

## Cross-References

### RULE-013

All cross-references shall use relative links with anchors (e.g., `[RULE-001](rules.md#rule-001)`).

### RULE-014

Iterations shall cite relevant specs under dev/ or user/, and corresponding tests.

### RULE-015

Specs under dev/ and user/ shall cite decisions when the spec derives from them.

### RULE-016

Tests shall not cite iterations; the reference direction is iterations → tests, not backwards.
