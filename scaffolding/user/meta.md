# META: Specification Format

This component defines how to write specifications using GEARS (Generalized [EARS](https://alistairmavin.com/ears/)) syntax, per [DR-000](../decisions/000-initial-specs-structure.md#dr-000-initial-specs-structure).

## File Format

### META-001

Each specification file shall be named `<kebab-case-component>.md`.

### META-002

Each item ID shall follow the format `<COMP>-NNN` (e.g., META-001, AUTH-017).

### META-003

Each item ID shall be a markdown heading for anchor linking.

### META-004

Each item shall be self-contained and not rely on surrounding section headings for context.

### META-005

Item IDs shall not be modified once commited; new items shall use higher IDs.

## GEARS Patterns

### META-006

Each item shall use one of the following GEARS (Generalized [EARS](https://alistairmavin.com/ears/)) patterns, where `<subject>` is any noun (system, component, agent, artifact, etc.):

| Pattern | Template |
| ------- | -------- |
| Ubiquitous | The `<subject>` shall `<action>`. |
| Event-driven | When `<trigger>`, the `<subject>` shall `<action>`. |
| State-driven | While `<state>`, the `<subject>` shall `<action>`. |
| Optional | Where `<feature>`, the `<subject>` shall `<action>`. |
| Unwanted | If `<condition>`, then the `<subject>` shall `<action>`. |
