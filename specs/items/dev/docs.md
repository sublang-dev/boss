<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DOC: User Documentation

## Intent

This spec defines requirements for user-facing documentation.

## Coverage

### DOC-1

Where Boss is released, user documentation in `docs/` shall cover
installation, CLI reference, agent configuration, workspace
management, tmux usage, and troubleshooting.

### DOC-2

Where the installation guide exists, it shall describe prerequisites,
step-by-step setup for macOS, Linux, and WSL2, API key
configuration, and expected command output for each step.

### DOC-3

Where the CLI reference exists, it shall document every CLI command
with synopsis, options, examples, and exit codes.

### DOC-4

Where the agent configuration guide exists, it shall document each
supported agent's authentication methods (subscription primary,
API-key fallback), autonomy configuration, and relevant environment
variables.

### DOC-5

Where the workspace guide exists, it shall document workspace
creation, naming constraints, multi-agent concurrency, listing
output, removal behavior, and data persistence across container
restarts.

### DOC-6

Where the tmux reference exists, it shall document detach/reattach,
pane operations, scrollback navigation, default configuration, and
user customization.

### DOC-7

Where the troubleshooting guide exists, it shall document common
failure modes: runtime unavailable, container not running, memory
exhaustion, per-agent authentication failures, unexpected permission
prompts, and read-only filesystem errors.
