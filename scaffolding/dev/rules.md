# RULE: Development Rules

This component defines development rules for the project.

## Git Commits

### RULE-001

The AI agent shall verify `user.name` and `user.email` are configured before committing.

### RULE-002

Each commit message shall use `<type>(<scope>)<!>: <subject>` format, where `<scope>` is optional, `!` is included for breaking changes, `<type>` is one of `feat|fix|docs|style|refactor|test|ci|build|perf|chore`, and `<subject>` is imperative, ≤50 chars, with no trailing period.

### RULE-003

The commit body shall explain what/why (not how), wrap at 72 chars, and use bullets if clearer.

### RULE-004

When AI assists in authoring a commit, the message shall include a `Co-authored-by` trailer.

## Test Spec Format ([DR-000](../decisions/000-initial-specs-structure.md#dr-000-initial-specs-structure))

### RULE-005

Each test file shall be named `<kebab-case-feature>.md`.

### RULE-006

Each test case ID shall follow `<FEAT>-NNN` format (e.g., SPDX-001, AUTH-017) as a markdown heading for anchor linking.

### RULE-007

Each test case shall use Given/When/Then (GWT) format per [META-006](../user/meta.md#meta-006) and be self-contained.

### RULE-008

Test case IDs shall not be modified once committed; new cases shall use higher IDs.

## Cross-References

### RULE-009

All cross-references shall use relative links with anchors (e.g., `[RULE-001](rules.md#rule-001)`).

### RULE-010

Iterations shall cite relevant specs under dev/ or user/, and corresponding tests.

### RULE-011

Specs under dev/ and user/ shall cite decisions when the spec derives from them.

### RULE-012

Tests shall not cite iterations; the reference direction is iterations → tests, not backwards.
