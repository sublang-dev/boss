<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SANDBOX: Sandbox Image Verification

This component defines verification checks for the local IterOn
sandbox image.

## Core Checks

### SBT-001

Where the image source exists, when a runtime builds
`iteron-sandbox:<tag>`, the build shall exit 0
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-002

Where `iteron-sandbox:<tag>` is built, when `claude --version`,
`codex --version`, `gemini --version`, and `opencode --version`
run in the container, each command shall exit 0
([DR-001 Context](../decisions/001-sandbox-architecture.md#context)).

### SBT-003

Where `iteron-sandbox:<tag>` is built, when `cat /proc/1/comm`
runs in the container, output shall be `tini`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-004

Where `iteron-sandbox:<tag>` is built, when `id` runs in the
container, output shall include `uid=1000(iteron)` and
`gid=1000(iteron)`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-012

Where `iteron-sandbox:<tag>` is built, when `tmux -V` runs in the
container, the command shall exit 0 and print a tmux version
([DR-001 §2](../decisions/001-sandbox-architecture.md#2-tmux-mapping)).

## Security and Defaults

### SBT-005

Where `iteron-sandbox:<tag>` runs read-only, when a process
writes outside `/tmp` and `/home/iteron`, the write shall fail
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-006

Where `iteron-sandbox:<tag>` runs read-only with tmpfs `/tmp`,
when a process writes inside `/tmp`, the write shall succeed
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-007

Where `iteron-sandbox:<tag>` is built, the SUID/SGID file count
from `find / -perm /6000 -type f` shall be `0`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-008

Where `iteron-sandbox:<tag>` is built, the following files shall
exist:
`/home/iteron/.claude.json`,
`/home/iteron/.claude/settings.json`,
`/home/iteron/.codex/config.toml`,
`/home/iteron/.gemini/settings.json`,
`/home/iteron/.config/opencode/opencode.json`,
`/etc/tmux.conf`, and
`/home/iteron/.tmux.conf`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary),
[DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)).

### SBT-009

Where `iteron-sandbox:<tag>` is built, the default Claude config
shall include onboarding bypass and tool-permission settings
([DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)).

## Script Checks

### SBT-010

Where `scripts/build-image.sh --help` is run, usage shall include
`--tag`, `--multi-arch`, and `--push`.

### SBT-011

Where `scripts/build-image.sh --multi-arch` is run without
`--push`, the script shall exit non-zero with a clear error.

## Image Size

### SBT-013

Where a multi-arch sandbox image is published to a registry, when
compressed layer sizes are summed per platform from the registry
manifest, the total for `linux/amd64` and for `linux/arm64` shall
each be less than or equal to 700 MiB.

## Headless Authentication

### SBT-014

Where `iteron init` creates `~/.iteron/.env`, the template shall
contain placeholders for `CLAUDE_CODE_OAUTH_TOKEN`,
`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, and `GEMINI_API_KEY`
([LCD-001](../dev/lifecycle.md#lcd-001)).

### SBT-015

Where `~/.iteron/.env` defines `CLAUDE_CODE_OAUTH_TOKEN=<value>`,
when the container starts, `printenv CLAUDE_CODE_OAUTH_TOKEN`
inside the container shall equal `<value>`
([SBX-006](../user/sandbox-image.md#sbx-006),
[LCD-002](../dev/lifecycle.md#lcd-002)).

### SBT-016

Where the official sandbox image is running, `printenv NO_BROWSER`
inside the container shall equal `true`
([SBD-010](../dev/sandbox-image.md#sbd-010)).

### SBT-017

Where the supported host OpenCode credential file exists at start
time, the container file
`/home/iteron/.local/share/opencode/auth.json` shall exist and be
readable and writable by the runtime user
([SBD-012](../dev/sandbox-image.md#sbd-012)).

### SBT-018

Where the supported host OpenCode credential file is absent at
start time, container mount metadata shall not contain an OpenCode
credential file mapping
([SBD-013](../dev/sandbox-image.md#sbd-013)).

### SBT-019

Where a user runs `codex login --device-auth` in a sandbox Codex
session, the CLI shall print a device-auth URL and one-time code
([SBX-008](../user/sandbox-image.md#sbx-008)).

### SBT-020

Where a user runs Gemini interactive auth in the sandbox with no
cached credentials, the CLI shall print an auth URL and accept an
authorization code pasted in the terminal
([SBX-009](../user/sandbox-image.md#sbx-009)).

### SBT-021

Where `CLAUDE_CODE_OAUTH_TOKEN` is unset and
`ANTHROPIC_API_KEY=<value>` is set in `~/.iteron/.env`, a
non-interactive Claude command in the container shall
authenticate successfully
([SBX-007](../user/sandbox-image.md#sbx-007)).

### SBT-022

Where `CODEX_API_KEY=<value>` is set in `~/.iteron/.env`, a
non-interactive `codex exec` command in the container shall
authenticate successfully
([SBX-008](../user/sandbox-image.md#sbx-008)).

### SBT-023

Where `GEMINI_API_KEY=<value>` is set in `~/.iteron/.env`, a
non-interactive Gemini command in the container shall
authenticate successfully
([SBX-009](../user/sandbox-image.md#sbx-009)).

### SBT-024

Where forwarded OpenCode credentials are absent and a supported
provider API key is set in `~/.iteron/.env`, OpenCode
non-interactive commands in the container shall authenticate
successfully
([SBX-010](../user/sandbox-image.md#sbx-010)).

## Autonomous Execution Validation

### SBT-025

Where the autonomous execution fixture is created with a single
deterministic known defect and a fixed oracle, when the oracle test
is run before agent edits, the oracle shall fail.

### SBT-026

Where autonomous execution validation runs for `claude` on a fresh
isolated fixture workspace seeded from the fixture baseline, the
agent command shall exit successfully within a bounded run time,
the oracle test shall pass after the run, and captured output shall
contain no interactive permission approval prompt.

### SBT-027

Where autonomous execution validation runs for `codex` on a fresh
isolated fixture workspace seeded from the fixture baseline with
workspace trust preconditions satisfied, the agent command shall
exit successfully within a bounded run time, the oracle test shall
pass after the run, and captured output shall contain no
interactive permission approval prompt.

### SBT-028

Where autonomous execution validation runs for `gemini` on a fresh
isolated fixture workspace seeded from the fixture baseline, the
agent command shall exit successfully within a bounded run time,
the oracle test shall pass after the run, and captured output shall
contain no interactive permission approval prompt.

### SBT-029

Where autonomous execution validation runs for `opencode` on a
fresh isolated fixture workspace seeded from the fixture baseline,
the agent command shall exit successfully within a bounded run
time, the oracle test shall pass after the run, and captured output
shall contain no interactive permission approval prompt.

### SBT-030

Where autonomous execution diagnostics are emitted, diagnostic
output shall not contain literal values of configured
authentication secrets.

### SBT-031

Where an agent completes an autonomous repair run on the fixture,
fixture oracle definitions shall remain unchanged after the run,
verifying the task contract preserves oracle definitions while
repairing the known defect under test.

### SBT-032

Where an autonomous agent run fails an autonomous success
criterion, emitted failure diagnostics shall include the run exit
status and a bounded excerpt of captured run output.

## User-Local Tool Layer

### SBT-033

Where `iteron-sandbox:<tag>` is built, `/home/iteron/.local/bin`
shall exist and be writable by the `iteron` user
([SBD-014](../dev/sandbox-image.md#sbd-014)).

### SBT-034

Where a standalone binary is placed in `/home/iteron/.local/bin`
inside the container, the binary shall be executable by name
without specifying its full path
([SBX-011](../user/sandbox-image.md#sbx-011)).

### SBT-035

Where `iteron start` launches a container with a pre-existing
`iteron-data` volume that lacks `~/.local/bin`, after start
completes, `/home/iteron/.local/bin` shall exist and be writable
by the `iteron` user
([SBD-015](../dev/sandbox-image.md#sbd-015)).

## Container Hardening

### SBT-036

Where `iteron start` has launched the container, container inspection
shall show all Linux capabilities dropped
([LCD-004](../dev/lifecycle.md#lcd-004)).

### SBT-037

Where `iteron start` has launched the container, container security
options shall include no-new-privileges
([LCD-004](../dev/lifecycle.md#lcd-004)).

### SBT-038

Where `iteron init` runs on a non-rootless container runtime, the
command shall exit non-zero and refuse to proceed
([LCD-003](../dev/lifecycle.md#lcd-003)).

## Vulnerability Scanning

### SBT-039

Where the image is scanned with the accepted-CVE list applied as
scanner exclusions, the scanner shall report zero CRITICAL or HIGH CVEs
([SBD-018](../dev/sandbox-image.md#sbd-018)).

## Tmux Configuration

### SBT-040

Where `iteron-sandbox:<tag>` is built, `/etc/tmux.conf` shall
contain `set-clipboard on` and `allow-passthrough on`
([SBD-020](../dev/sandbox-image.md#sbd-020)).

### SBT-041

Where `iteron-sandbox:<tag>` is built, the image-provided default
`/home/iteron/.tmux.conf` shall contain only comment lines and blank
lines
([SBD-021](../dev/sandbox-image.md#sbd-021)).

### SBT-042

Where `iteron-sandbox:<tag>` is built, `/etc/tmux.conf` shall bind
`MouseDragEnd1Pane` to `copy-selection-and-cancel` in both
`copy-mode` and `copy-mode-vi`, and bind a prefix key to toggle
mouse mode
([SBD-022](../dev/sandbox-image.md#sbd-022)).
