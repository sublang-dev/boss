# DR-000: Initial Specs Structure

## Status

Accepted

## Context

Projects need a standardized structure for specifications to support iterative development and collaboration between AI and humans.

## Decision

Use `iteron init` to create:

```text
specs/
├── decisions/    # Decision Records (DRs)
├── iterations/   # Iteration Records (IRs)
├── user/         # User-facing specifications - what the system does
├── dev/          # System internal specs for development - how the system is built
└── tests/        # Test case specifications
```

### Initial Directories

| Directory | Format | Naming |
| --------- | ------- | ------ |
| decisions/ | [ADR](https://adr.github.io/) (Architectural Decision Record) | `NNN-<kebab-case-title>.md` |
| iterations/ | Goal, deliverables, tasks, verification | `NNN-<kebab-case-title>.md` |
| user/ | GEARS | `<kebab-case-component>.md` |
| dev/ | GEARS | `<kebab-case-component>.md` |
| tests/ | Test cases by feature | `<kebab-case-feature>.md` |

GEARS (Generalized [EARS](https://alistairmavin.com/ears/)) extends EARS:
- Any `<subject>` (system, component, agent, artifact, etc.) instead of only `<system>`
- Patterns may be combined: `<clauses>` the `<subject>` shall `<action>`

| Pattern | Clause |
| ------- | ------ |
| Ubiquitous | _(none)_ |
| Event-driven | When `<trigger>`, |
| State-driven | While `<state>`, |
| Optional | Where `<feature>`, |
| Unwanted | If `<trigger>`, then |

Test cases use Given/When/Then (GWT), mapping to State + Event patterns.

Subdirectories optional for user/, dev/, and tests/.

### Initial Files

| Path | Content |
| ---- | ------- |
| `decisions/000-initial-specs-structure.md` | This DR |
| `iterations/000-spdx-headers.md` | Initial IR |
| `user/meta.md` | GEARS syntax guide |
| `dev/git.md` | Git workflow rules |
| `dev/style.md` | Authoring conventions |
| `tests/spdx-headers.md` | SPDX headers verification |

## Consequences

- Consistent structure across iterations
- Clear separation of user-facing and internal specs
- Test cases decoupled from iterations for traceability
