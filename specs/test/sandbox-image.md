<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SANDBOX: Sandbox Image Verification

This component defines verification checks for the local Boss
sandbox image.

## Core Checks

### SBT-001

Where the image source exists, when a runtime builds
`boss-sandbox:<tag>`, the build shall exit 0
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-002

Where `boss-sandbox:<tag>` is built, when `claude --version`,
`codex --version`, `gemini --version`, and `opencode --version`
run in the container, each command shall exit 0
([DR-001 Context](../decisions/001-sandbox-architecture.md#context)).

### SBT-003

Where `boss-sandbox:<tag>` is built, when `cat /proc/1/comm`
runs in the container, output shall be `tini`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-004

Where `boss-sandbox:<tag>` is built, when `id` runs in the
container, output shall include `uid=1000(boss)` and
`gid=1000(boss)`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-012

Where `boss-sandbox:<tag>` is built, when `tmux -V` runs in the
container, the command shall exit 0 and print a tmux version
([DR-001 §2](../decisions/001-sandbox-architecture.md#2-tmux-mapping)).

### SBT-045

Where `boss-sandbox:<tag>` is built, when `locale` runs in the
container, `LANG` and `LC_ALL` shall both be `en_US.UTF-8`
([SBD-004](../dev/sandbox-image.md#sbd-004)).

## Security and Defaults

### SBT-005

Where `boss-sandbox:<tag>` runs read-only, when a process
writes outside `/tmp` and `/home/boss`, the write shall fail
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-006

Where `boss-sandbox:<tag>` runs read-only with tmpfs `/tmp`,
when a process writes inside `/tmp`, the write shall succeed
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-007

Where `boss-sandbox:<tag>` is built, the SUID/SGID file count
from `find / -perm /6000 -type f` shall be `0`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SBT-008

Where `boss-sandbox:<tag>` is built, the following files shall
exist:
`/home/boss/.claude.json`,
`/home/boss/.claude/settings.json`,
`/home/boss/.codex/config.toml`,
`/home/boss/.gemini/settings.json`,
`/home/boss/.config/opencode/opencode.json`,
`/etc/tmux.conf`, and
`/home/boss/.tmux.conf`
([DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary),
[DR-001 §3](../decisions/001-sandbox-architecture.md#3-authentication)).

### SBT-009

Where `boss-sandbox:<tag>` is built, the default Claude config
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

Where `boss init` creates `~/.boss/.env`, the template shall
contain placeholders for `CLAUDE_CODE_OAUTH_TOKEN`,
`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, and `GEMINI_API_KEY`
([LCD-001](../dev/lifecycle.md#lcd-001)).

### SBT-015

Where `~/.boss/.env` defines `CLAUDE_CODE_OAUTH_TOKEN=<value>`,
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
`/home/boss/.local/share/opencode/auth.json` shall exist and be
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
`ANTHROPIC_API_KEY=<value>` is set in `~/.boss/.env`, a
non-interactive Claude command in the container shall
authenticate successfully
([SBX-007](../user/sandbox-image.md#sbx-007)).

### SBT-022

Where `CODEX_API_KEY=<value>` is set in `~/.boss/.env`, a
non-interactive `codex exec` command in the container shall
authenticate successfully
([SBX-008](../user/sandbox-image.md#sbx-008)).

### SBT-023

Where `GEMINI_API_KEY=<value>` is set in `~/.boss/.env`, a
non-interactive Gemini command in the container shall
authenticate successfully
([SBX-009](../user/sandbox-image.md#sbx-009)).

### SBT-024

Where forwarded OpenCode credentials are absent and a supported
provider API key is set in `~/.boss/.env`, OpenCode
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

Where `boss-sandbox:<tag>` is built, `/home/boss/.local/bin`
shall exist and be writable by the `boss` user
([SBD-014](../dev/sandbox-image.md#sbd-014)).

### SBT-034

Where a standalone binary is placed in `/home/boss/.local/bin`
inside the container, the binary shall be executable by name
without specifying its full path
([SBX-011](../user/sandbox-image.md#sbx-011)).

### SBT-035

Where `boss start` launches a container with a pre-existing
`boss-data` volume that lacks `~/.local/bin`, after start
completes, `/home/boss/.local/bin` shall exist and be writable
by the `boss` user
([SBD-015](../dev/sandbox-image.md#sbd-015)).

## Container Hardening

### SBT-036

Where `boss start` has launched the container, container inspection
shall show all Linux capabilities dropped
([LCD-004](../dev/lifecycle.md#lcd-004)).

### SBT-037

Where `boss start` has launched the container, container security
options shall include no-new-privileges
([LCD-004](../dev/lifecycle.md#lcd-004)).

### SBT-038

Where `boss init` runs on a non-rootless container runtime, the
command shall exit non-zero and refuse to proceed
([LCD-003](../dev/lifecycle.md#lcd-003)).

## Vulnerability Scanning

### SBT-039

Where the image is scanned with the accepted-CVE list applied as
scanner exclusions, the scanner shall report zero CRITICAL or HIGH CVEs
([SBD-018](../dev/sandbox-image.md#sbd-018)).

## Tmux Configuration

### SBT-040

Where `boss-sandbox:<tag>` is built, `/etc/tmux.conf` shall
contain `set-clipboard on` and `allow-passthrough on`
([SBD-020](../dev/sandbox-image.md#sbd-020)).

### SBT-050

Where `boss-sandbox:<tag>` is built, `/etc/tmux.conf` shall
contain `set -g default-terminal "screen-256color"`
([SBD-028](../dev/sandbox-image.md#sbd-028)).

### SBT-041

Where `boss-sandbox:<tag>` is built, the image-provided default
`/home/boss/.tmux.conf` shall contain only comment lines and blank
lines
([SBD-021](../dev/sandbox-image.md#sbd-021)).

### SBT-042

Where `boss-sandbox:<tag>` is built, `/etc/tmux.conf` shall bind
`MouseDragEnd1Pane` to `copy-selection-and-cancel` in both
`copy-mode` and `copy-mode-vi`, and bind a prefix key to toggle
mouse mode
([SBD-022](../dev/sandbox-image.md#sbd-022)).

### SBT-043

Where `boss-sandbox:<tag>` is built, `/etc/tmux.conf` shall
default mouse mode to off and restore the `mouse` preference
from `~/.boss-prefs` on startup when the file exists
([SBD-023](../dev/sandbox-image.md#sbd-023)).

### SBT-044

Where `boss-sandbox:<tag>` is built, when the mouse-toggle
prefix-key binding fires, `/etc/tmux.conf` shall write the
updated `mouse` value to `~/.boss-prefs` in `key=value` format
([SBD-023](../dev/sandbox-image.md#sbd-023)).

## User-Space Tool Provisioning

### SBT-046

Where `boss-sandbox:<tag>` is built, `mise --version` in the
container shall exit 0 and print the pinned version
([SBD-024](../dev/sandbox-image.md#sbd-024)).

### SBT-047

Where `boss-sandbox:<tag>` is built, `/etc/mise/config.toml`
shall declare `npm:@anthropic-ai/claude-code`,
`npm:@google/gemini-cli`, `npm:opencode-ai`, and
`github:openai/codex`
([SBD-025](../dev/sandbox-image.md#sbd-025)).

### SBT-048

Where `boss-sandbox:<tag>` is built, `/etc/mise/mise.lock`
shall exist and contain version entries for all declared tools
([SBD-026](../dev/sandbox-image.md#sbd-026)).

### SBT-049

Where `boss-sandbox:<tag>` is built, `claude --version`,
`codex --help`, `gemini --version`, and `opencode --version`
shall each exit 0 via mise shims
([SBD-027](../dev/sandbox-image.md#sbd-027)).

## DR-005 Package Manager Environment

### SBT-051

Where `boss-sandbox:<tag>` is built, container `ENV` shall set
`XDG_CONFIG_HOME=/home/boss/.config`,
`XDG_CACHE_HOME=/home/boss/.cache`,
`XDG_DATA_HOME=/home/boss/.local/share`,
`XDG_STATE_HOME=/home/boss/.local/state`,
`PYTHONUSERBASE=/home/boss/.local`,
`PIP_USER=1`,
`NPM_CONFIG_PREFIX=/home/boss/.local/share/npm-global`,
`GOPATH=/home/boss/.local/share/go`,
`GOBIN=/home/boss/.local/bin`,
`CARGO_HOME=/home/boss/.local/share/cargo`, and
`RUSTUP_HOME=/home/boss/.local/share/rustup`
([SBD-029](../dev/sandbox-image.md#sbd-029)).

### SBT-052

Where `boss-sandbox:<tag>` is built, `PATH` shall start with
`/home/boss/.local/share/mise/shims:/home/boss/.local/bin:/home/boss/.local/share/npm-global/bin:/home/boss/.local/share/cargo/bin:`
([SBD-014](../dev/sandbox-image.md#sbd-014)).

### SBT-053

Where `boss-sandbox:<tag>` is built, `sudo -n <cmd>` inside the
container shall execute `<cmd>` unprivileged and print the rootless
context line; `sudo -u`, `sudo -g`, and `sudo -i` forms shall exit 1
with informative errors
([SBD-030](../dev/sandbox-image.md#sbd-030)).

### SBT-054

Where a container starts from `boss-sandbox:<tag>` with a writable
home volume, startup shall seed missing files from `/opt/defaults/`
into `$HOME` and shall not overwrite an already-existing target file
([SBD-031](../dev/sandbox-image.md#sbd-031)).

### SBT-055

Where a container starts from `boss-sandbox:<tag>`, startup shall
persist `BOSS_IMAGE_VERSION` in
`$XDG_STATE_HOME/.boss-image-version`. Where the stored value differs
from current `BOSS_IMAGE_VERSION`, startup logs shall include both
previous and current values
([SBD-032](../dev/sandbox-image.md#sbd-032)).

### SBT-056

Where `boss-sandbox:<tag>` is built, `gpg --version`,
`tree --version`, `gh --version`, and `glab --version` in the
container shall each exit 0
([SBD-033](../dev/sandbox-image.md#sbd-033),
[SBX-014](../user/sandbox-image.md#sbx-014)).

### SBT-057

Where interactive Bash loads the default `.bashrc` in the container,
`PROMPT_COMMAND` shall include `_pip_user_venv_guard`; when
`VIRTUAL_ENV` is set then the guard shall unset `PIP_USER`, and when
`VIRTUAL_ENV` is removed after a venv-active state, the guard shall
restore `PIP_USER=1`
([DR-005 §1](../decisions/005-package-manager-environment.md#1-xdg-environment-variables)).
