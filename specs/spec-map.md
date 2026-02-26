<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference guide for AI agents to locate the right spec file.
Spec files are source of truth.

## Layout

```text
decisions/   Architectural decision records (DR-NNN)
iterations/  Iteration records (IR-NNN)
dev/         Implementation requirements
user/        User-facing behavior
test/        Verification criteria
```

Specs use GEARS syntax ([META-001](user/meta.md#meta-001)).
Authoring rules: [dev/style.md](dev/style.md).

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| DR-000 | [000-initial-specs-structure.md](decisions/000-initial-specs-structure.md) | Specs directory layout, GEARS syntax, naming conventions |
| DR-001 | [001-sandbox-architecture.md](decisions/001-sandbox-architecture.md) | OCI container design, Podman, tmux mapping, auth strategies |
| DR-002 | [002-iteron-cli-commands.md](decisions/002-iteron-cli-commands.md) | Workspace model and 6-command CLI (init/start/stop/open/ls/rm) |
| DR-003 | [003-runtime-profiled-auth.md](decisions/003-runtime-profiled-auth.md) | Runtime-profiled auth: local (file mounts) vs AWS (Secrets Manager) |
| DR-004 | [004-user-tool-provisioning.md](decisions/004-user-tool-provisioning.md) | Three-layer tool provisioning via mise: image / manifest / volume |
| DR-005 | [005-package-manager-environment.md](decisions/005-package-manager-environment.md) | XDG env vars for native package managers, mock sudo shim, entrypoint defaults seeding, EFS tuning |

## Iterations

| ID | File | Goal |
| --- | --- | --- |
| IR-000 | [000-spdx-headers.md](iterations/000-spdx-headers.md) | Add SPDX headers to applicable files |
| IR-001 | [001-oci-sandbox-image.md](iterations/001-oci-sandbox-image.md) | Multi-arch OCI image with four agent runtimes |
| IR-002 | [002-container-lifecycle.md](iterations/002-container-lifecycle.md) | `boss init`, `start`, `stop` commands |
| IR-003 | [003-tests-ci.md](iterations/003-tests-ci.md) | Automated tests and CI pipeline |
| IR-004 | [004-workspace-interaction.md](iterations/004-workspace-interaction.md) | `boss open`, `ls`, `rm` commands |
| IR-005 | [005-headless-auth.md](iterations/005-headless-auth.md) | Headless authentication for all agents |
| IR-006 | [006-autonomous-execution.md](iterations/006-autonomous-execution.md) | Autonomous agent execution validation |
| IR-007 | [007-reliability-security.md](iterations/007-reliability-security.md) | Reliability, security, CVEs, and documentation |
| IR-008 | [008-user-tool-provisioning.md](iterations/008-user-tool-provisioning.md) | User-space tool provisioning via mise |
| IR-009 | [009-dr005-rollout-and-dev-cli-baseline.md](iterations/009-dr005-rollout-and-dev-cli-baseline.md) | DR-005 rollout and baseline developer CLIs |

## Spec Files

### `dev/`

| File | Summary |
| --- | --- |
| [git.md](dev/git.md) | Commit message format and AI co-authorship trailers |
| [docs.md](dev/docs.md) | User documentation coverage: install, CLI reference, agents, workspaces, tmux, troubleshooting |
| [lifecycle.md](dev/lifecycle.md) | Rootless enforcement, container hardening, env template, env exposure |
| [release.md](dev/release.md) | Semantic versioning, changelog, npm publish with provenance |
| [sandbox-image.md](dev/sandbox-image.md) | Dockerfile, agent installs, runtime defaults, security hardening, image size budget, headless auth config, vulnerability scanning |
| [style.md](dev/style.md) | Spec naming, ID format, GEARS syntax, cross-refs, record format, and SPDX headers |
| [workspace.md](dev/workspace.md) | Session identity format, input constraints, open/ls/rm behavior |

### `user/`

| File | Summary |
| --- | --- |
| [meta.md](user/meta.md) | GEARS syntax definition and test-spec mapping |
| [sandbox-image.md](user/sandbox-image.md) | Agent availability, runtime behavior, headless auth per agent |
| [workspace.md](user/workspace.md) | Argument resolution, session reattach, ls tree view, rm, error handling |

### `test/`

| File | Summary |
| --- | --- |
| [spdx-headers.md](test/spdx-headers.md) | Copyright and license header presence checks |
| [sandbox-image.md](test/sandbox-image.md) | Build, security, config, script, image size, auth, autonomous execution, container hardening, and vulnerability scanning checks |
| [workspace.md](test/workspace.md) | Session identity, input constraints, open/ls/rm, container-down handling |
