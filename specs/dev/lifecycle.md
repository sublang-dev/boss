<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai> -->

# LIFECYCLE: Container Lifecycle Requirements

This component defines implementation requirements for lifecycle
commands that prepare and launch the local IterOn sandbox.

## Headless Authentication

### LCD-001

Where `iteron init` creates `~/.iteron/.env`, the template shall
include placeholders for `CLAUDE_CODE_OAUTH_TOKEN`,
`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, and `GEMINI_API_KEY`
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication),
[DR-002 §1](../decisions/002-iteron-cli-commands.md#1-iteron-init)).

### LCD-002

Where `iteron start` launches the sandbox container,
authentication variables from `~/.iteron/.env` shall be exposed to
processes in the container environment
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication),
[DR-002 §2](../decisions/002-iteron-cli-commands.md#2-iteron-start)).
