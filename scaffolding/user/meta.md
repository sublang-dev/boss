# META: Specification Format

This component defines how to write specifications using GEARS (Generalized [EARS](https://alistairmavin.com/ears/)) syntax, per [DR-000](../decisions/000-initial-specs-structure.md#dr-000-initial-specs-structure).

## File Format

### META-001

Each specification file shall be named `<kebab-case-component>.md`.

### META-002

Each item ID shall follow `<COMP>-NNN` format (e.g., META-001, AUTH-017) as a markdown heading for anchor linking.

### META-003

Each item shall be self-contained and not rely on surrounding section headings for context.

### META-004

Item IDs shall not be modified once committed; new items shall use higher IDs.

## GEARS Patterns

### META-005

Each item shall use one or more GEARS (Generalized [EARS](https://alistairmavin.com/ears/)) patterns combined before the `shall` clause, where `<subject>` is any noun (system, component, agent, artifact, etc.):

| Pattern | Clause |
| ------- | ------ |
| Ubiquitous | _(none)_ |
| Event-driven | When `<trigger>`, |
| State-driven | While `<state>`, |
| Optional | Where `<feature>`, |
| Unwanted | If `<trigger>`, then |

Template: `<clauses>` the `<subject>` shall `<action>`.

### META-006

Test cases shall use Given/When/Then (GWT) format, which combines State-driven and Event-driven patterns:

| GWT | GEARS Equivalent |
| --- | ---------------- |
| **Given** `<precondition>` | While `<precondition>` |
| **And** `<additional>` | and `<additional>` |
| **When** `<trigger>` | when `<trigger>` |
| **Then** `<subject>` shall `<action>` | the `<subject>` shall `<action>` |
