<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SAND: Sandbox Image Verification

## Intent

This spec defines verification checks for the local Boss
sandbox image.

## Core Checks

### SAND-51

Verifies: [SAND-6](../dev/sandbox-image.md#sand-6)

Where the image source exists, when a runtime builds
`boss-sandbox:<tag>`, the build shall exit 0
([DR-001 §1](../../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SAND-52

Verifies: [SAND-2](../dev/sandbox-image.md#sand-2), [SAND-37](../user/sandbox-image.md#sand-37)

Where `boss-sandbox:<tag>` is built, when `claude --version` and
`codex --help` run in the container, each command shall exit 0.
On-demand agents (`gemini`, `opencode`) are verified after
first-use installation via `boss open`
([DR-001 Context](../../decisions/001-sandbox-architecture.md#context)).

### SAND-53

Verifies: [SAND-4](../dev/sandbox-image.md#sand-4)

Where `boss-sandbox:<tag>` is built, when `cat /proc/1/comm`
runs in the container, output shall be `tini`
([DR-001 §1](../../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SAND-54

Verifies: [SAND-4](../dev/sandbox-image.md#sand-4), [SAND-38](../user/sandbox-image.md#sand-38)

Where `boss-sandbox:<tag>` is built, when `id` runs in the
container, output shall include `uid=1000(boss)` and
`gid=1000(boss)`
([DR-001 §1](../../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SAND-55

Verifies: [SAND-19](../dev/sandbox-image.md#sand-19)

Where `boss-sandbox:<tag>` is built, when `tmux -V` runs in the
container, the command shall exit 0 and print a tmux version
([DR-001 §2](../../decisions/001-sandbox-architecture.md#2-tmux-mapping)).

### SAND-56

Verifies: [SAND-4](../dev/sandbox-image.md#sand-4), [SAND-40](../user/sandbox-image.md#sand-40)

Where `boss-sandbox:<tag>` is built, when `locale` runs in the
container, `LANG` and `LC_ALL` shall both be `en_US.UTF-8`
([SAND-4](../dev/sandbox-image.md#sand-4)).

## Security and Defaults

### SAND-57

Verifies: [SAND-39](../user/sandbox-image.md#sand-39)

Where `boss-sandbox:<tag>` runs read-only, when a process
writes outside `/tmp` and `/home/boss`, the write shall fail
([DR-001 §1](../../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SAND-58

Verifies: [SAND-39](../user/sandbox-image.md#sand-39)

Where `boss-sandbox:<tag>` runs read-only with tmpfs `/tmp`,
when a process writes inside `/tmp`, the write shall succeed
([DR-001 §1](../../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SAND-59

Verifies: [SAND-5](../dev/sandbox-image.md#sand-5)

Where `boss-sandbox:<tag>` is built, the SUID/SGID file count
from `find / -perm /6000 -type f` shall be `0`
([DR-001 §1](../../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### SAND-60

Verifies: [SAND-5](../dev/sandbox-image.md#sand-5)

Where `boss-sandbox:<tag>` is built, the following files shall
exist:
`/home/boss/.claude.json`,
`/home/boss/.claude/settings.json`,
`/home/boss/.claude/CLAUDE.md`,
`/home/boss/.codex/config.toml`,
`/home/boss/.codex/AGENTS.md`,
`/home/boss/.gemini/settings.json`,
`/home/boss/.gemini/GEMINI.md`,
`/home/boss/.config/opencode/opencode.json`,
`/home/boss/.config/opencode/AGENTS.md`,
`/etc/tmux.conf`, and
`/home/boss/.tmux.conf`
([DR-001 §1](../../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary),
[DR-001 §3](../../decisions/001-sandbox-architecture.md#3-authentication)).

### SAND-61

Verifies: [SAND-5](../dev/sandbox-image.md#sand-5), [SAND-42](../user/sandbox-image.md#sand-42)

Where `boss-sandbox:<tag>` is built, the default Claude config
shall include onboarding bypass and tool-permission settings
([DR-001 §3](../../decisions/001-sandbox-architecture.md#3-authentication)).

## Script Checks

### SAND-62

Verifies: [SAND-6](../dev/sandbox-image.md#sand-6)

Where `scripts/build-image.sh --help` is run, usage shall include
`--tag`, `--multi-arch`, and `--push`.

### SAND-63

Verifies: [SAND-7](../dev/sandbox-image.md#sand-7)

Where `scripts/build-image.sh --multi-arch` is run without
`--push`, the script shall exit non-zero with a clear error.

## Image Size

### SAND-64

Verifies: [SAND-8](../dev/sandbox-image.md#sand-8)

Where a multi-arch sandbox image is published to a registry, when
compressed layer sizes are summed per platform from the registry
manifest, the total for `linux/amd64` and for `linux/arm64` shall
each be less than or equal to 700 MiB.

## Headless Authentication

### SAND-65

Verifies: [LCD-1](../dev/lifecycle.md#lcd-001)

Where `boss init` creates `~/.boss/.env`, the template shall
contain placeholders for `CLAUDE_CODE_OAUTH_TOKEN`,
`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, and `GEMINI_API_KEY`
([LCD-1](../dev/lifecycle.md#lcd-001)).

### SAND-66

Verifies: [SAND-43](../user/sandbox-image.md#sand-43), [LCD-2](../dev/lifecycle.md#lcd-002)

Where `~/.boss/.env` defines `CLAUDE_CODE_OAUTH_TOKEN=<value>`,
when the container starts, `printenv CLAUDE_CODE_OAUTH_TOKEN`
inside the container shall equal `<value>`
([SAND-43](../user/sandbox-image.md#sand-43),
[LCD-2](../dev/lifecycle.md#lcd-002)).

### SAND-67

Verifies: [SAND-9](../dev/sandbox-image.md#sand-9)

Where the official sandbox image is running, `printenv NO_BROWSER`
inside the container shall equal `true`
([SAND-9](../dev/sandbox-image.md#sand-9)).

### SAND-68

Verifies: [SAND-11](../dev/sandbox-image.md#sand-11)

Where the supported host OpenCode credential file exists at start
time, the container file
`/home/boss/.local/share/opencode/auth.json` shall exist and be
readable and writable by the runtime user
([SAND-11](../dev/sandbox-image.md#sand-11)).

### SAND-69

Verifies: [SAND-12](../dev/sandbox-image.md#sand-12)

Where the supported host OpenCode credential file is absent at
start time, container mount metadata shall not contain an OpenCode
credential file mapping
([SAND-12](../dev/sandbox-image.md#sand-12)).

### SAND-70

Verifies: [SAND-45](../user/sandbox-image.md#sand-45)

Where a user runs `codex login --device-auth` in a sandbox Codex
session, the CLI shall print a device-auth URL and one-time code
([SAND-45](../user/sandbox-image.md#sand-45)).

### SAND-71

Verifies: [SAND-46](../user/sandbox-image.md#sand-46)

Where a user runs Gemini interactive auth in the sandbox with no
cached credentials, the CLI shall print an auth URL and accept an
authorization code pasted in the terminal
([SAND-46](../user/sandbox-image.md#sand-46)).

### SAND-72

Verifies: [SAND-44](../user/sandbox-image.md#sand-44)

Where `CLAUDE_CODE_OAUTH_TOKEN` is unset and
`ANTHROPIC_API_KEY=<value>` is set in `~/.boss/.env`, a
non-interactive Claude command in the container shall
authenticate successfully
([SAND-44](../user/sandbox-image.md#sand-44)).

### SAND-73

Verifies: [SAND-45](../user/sandbox-image.md#sand-45)

Where `CODEX_API_KEY=<value>` is set in `~/.boss/.env`, a
non-interactive `codex exec` command in the container shall
authenticate successfully
([SAND-45](../user/sandbox-image.md#sand-45)).

### SAND-74

Verifies: [SAND-46](../user/sandbox-image.md#sand-46)

Where `GEMINI_API_KEY=<value>` is set in `~/.boss/.env`, a
non-interactive Gemini command in the container shall
authenticate successfully
([SAND-46](../user/sandbox-image.md#sand-46)).

### SAND-75

Verifies: [SAND-47](../user/sandbox-image.md#sand-47)

Where forwarded OpenCode credentials are absent and a supported
provider API key is set in `~/.boss/.env`, OpenCode
non-interactive commands in the container shall authenticate
successfully
([SAND-47](../user/sandbox-image.md#sand-47)).

## Autonomous Execution Validation

### SAND-76

Verifies: [SAND-42](../user/sandbox-image.md#sand-42)

Where the autonomous execution fixture is created with a single
deterministic known defect and a fixed oracle, when the oracle test
is run before agent edits, the oracle shall fail.

### SAND-77

Verifies: [SAND-42](../user/sandbox-image.md#sand-42), [SAND-37](../user/sandbox-image.md#sand-37)

Where autonomous execution validation runs for `claude` on a fresh
isolated fixture workspace seeded from the fixture baseline, the
agent command shall exit successfully within a bounded run time,
the oracle test shall pass after the run, and captured output shall
contain no interactive permission approval prompt.

### SAND-78

Verifies: [SAND-42](../user/sandbox-image.md#sand-42), [SAND-37](../user/sandbox-image.md#sand-37)

Where autonomous execution validation runs for `codex` on a fresh
isolated fixture workspace seeded from the fixture baseline with
workspace trust preconditions satisfied, the agent command shall
exit successfully within a bounded run time, the oracle test shall
pass after the run, and captured output shall contain no
interactive permission approval prompt.

### SAND-79

Verifies: [SAND-42](../user/sandbox-image.md#sand-42), [SAND-37](../user/sandbox-image.md#sand-37)

Where autonomous execution validation runs for `gemini` on a fresh
isolated fixture workspace seeded from the fixture baseline, the
agent command shall exit successfully within a bounded run time,
the oracle test shall pass after the run, and captured output shall
contain no interactive permission approval prompt.

### SAND-80

Verifies: [SAND-42](../user/sandbox-image.md#sand-42), [SAND-37](../user/sandbox-image.md#sand-37)

Where autonomous execution validation runs for `opencode` on a
fresh isolated fixture workspace seeded from the fixture baseline,
the agent command shall exit successfully within a bounded run
time, the oracle test shall pass after the run, and captured output
shall contain no interactive permission approval prompt.

### SAND-81

Verifies: [SAND-42](../user/sandbox-image.md#sand-42)

Where autonomous execution diagnostics are emitted, diagnostic
output shall not contain literal values of configured
authentication secrets.

### SAND-82

Verifies: [SAND-42](../user/sandbox-image.md#sand-42)

Where an agent completes an autonomous repair run on the fixture,
fixture oracle definitions shall remain unchanged after the run,
verifying the task contract preserves oracle definitions while
repairing the known defect under test.

### SAND-83

Verifies: [SAND-42](../user/sandbox-image.md#sand-42)

Where an autonomous agent run fails an autonomous success
criterion, emitted failure diagnostics shall include the run exit
status and a bounded excerpt of captured run output.

## User-Local Tool Layer

### SAND-84

Verifies: [SAND-13](../dev/sandbox-image.md#sand-13)

Where `boss-sandbox:<tag>` is built, `/home/boss/.local/bin`
shall exist and be writable by the `boss` user
([SAND-13](../dev/sandbox-image.md#sand-13)).

### SAND-85

Verifies: [SAND-48](../user/sandbox-image.md#sand-48)

Where a standalone binary is placed in `/home/boss/.local/bin`
inside the container, the binary shall be executable by name
without specifying its full path
([SAND-48](../user/sandbox-image.md#sand-48)).

### SAND-86

Verifies: [SAND-14](../dev/sandbox-image.md#sand-14)

Where `boss start` launches a container with a pre-existing
`boss-data` volume that lacks `~/.local/bin`, after start
completes, `/home/boss/.local/bin` shall exist and be writable
by the `boss` user
([SAND-14](../dev/sandbox-image.md#sand-14)).

## Container Hardening

### SAND-87

Verifies: [LCD-4](../dev/lifecycle.md#lcd-004)

Where `boss start` has launched the container, container inspection
shall show all Linux capabilities dropped
([LCD-4](../dev/lifecycle.md#lcd-004)).

### SAND-88

Verifies: [LCD-4](../dev/lifecycle.md#lcd-004)

Where `boss start` has launched the container, container security
options shall include no-new-privileges
([LCD-4](../dev/lifecycle.md#lcd-004)).

### SAND-89

Verifies: [LCD-3](../dev/lifecycle.md#lcd-003)

Where `boss init` runs on a non-rootless container runtime, the
command shall exit non-zero and refuse to proceed
([LCD-3](../dev/lifecycle.md#lcd-003)).

## Vulnerability Scanning

### SAND-90

Verifies: [SAND-17](../dev/sandbox-image.md#sand-17)

Where the image is scanned with the accepted-CVE list applied as
scanner exclusions, the scanner shall report zero CRITICAL or HIGH CVEs
([SAND-17](../dev/sandbox-image.md#sand-17)).

## Tmux Configuration

### SAND-91

Verifies: [SAND-19](../dev/sandbox-image.md#sand-19)

Where `boss-sandbox:<tag>` is built, `/etc/tmux.conf` shall
contain `set-clipboard on` and `allow-passthrough on`
([SAND-19](../dev/sandbox-image.md#sand-19)).

### SAND-92

Verifies: [SAND-20](../dev/sandbox-image.md#sand-20)

Where `boss-sandbox:<tag>` is built, `/etc/tmux.conf` shall
contain `set -g default-terminal "screen-256color"`
([SAND-20](../dev/sandbox-image.md#sand-20)).

### SAND-93

Verifies: [SAND-21](../dev/sandbox-image.md#sand-21)

Where `boss-sandbox:<tag>` is built, the image-provided default
`/home/boss/.tmux.conf` shall contain only comment lines and blank
lines
([SAND-21](../dev/sandbox-image.md#sand-21)).

### SAND-94

Verifies: [SAND-22](../dev/sandbox-image.md#sand-22)

Where `boss-sandbox:<tag>` is built, `/etc/tmux.conf` shall bind
`MouseDragEnd1Pane` to `copy-selection-and-cancel` in both
`copy-mode` and `copy-mode-vi`, and bind a prefix key to toggle
mouse mode
([SAND-22](../dev/sandbox-image.md#sand-22)).

### SAND-95

Verifies: [SAND-23](../dev/sandbox-image.md#sand-23)

Where `boss-sandbox:<tag>` is built, `/etc/tmux.conf` shall
default mouse mode to off and restore the `mouse` preference
from `~/.boss-prefs` on startup when the file exists
([SAND-23](../dev/sandbox-image.md#sand-23)).

### SAND-96

Verifies: [SAND-23](../dev/sandbox-image.md#sand-23)

Where `boss-sandbox:<tag>` is built, when the mouse-toggle
prefix-key binding fires, `/etc/tmux.conf` shall write the
updated `mouse` value to `~/.boss-prefs` in `key=value` format
([SAND-23](../dev/sandbox-image.md#sand-23)).

## User-Space Tool Provisioning

### SAND-97

Verifies: [SAND-24](../dev/sandbox-image.md#sand-24)

Where `boss-sandbox:<tag>` is built, `mise --version` in the
container shall exit 0 and print the pinned version
([SAND-24](../dev/sandbox-image.md#sand-24)).

### SAND-98

Verifies: [SAND-25](../dev/sandbox-image.md#sand-25)

Where `boss-sandbox:<tag>` is built, `/etc/mise/config.toml`
shall declare `npm:@anthropic-ai/claude-code` and
`github:openai/codex` (baseline agents only; on-demand agents
are declared in `/etc/mise/ondemand.toml`)
([SAND-25](../dev/sandbox-image.md#sand-25)).

### SAND-99

Verifies: [SAND-26](../dev/sandbox-image.md#sand-26)

Where `boss-sandbox:<tag>` is built, `/etc/mise/mise.lock`
shall exist and contain version entries for all declared tools
([SAND-26](../dev/sandbox-image.md#sand-26)).

### SAND-100

Verifies: [SAND-27](../dev/sandbox-image.md#sand-27)

Where `boss-sandbox:<tag>` is built, `claude --version` and
`codex --help` shall each exit 0 via mise shims (baseline
agents only; on-demand agents are verified after first-use
installation via `boss open`)
([SAND-27](../dev/sandbox-image.md#sand-27)).

## DR-005 Package Manager Environment

### SAND-101

Verifies: [SAND-31](../dev/sandbox-image.md#sand-31)

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
([SAND-31](../dev/sandbox-image.md#sand-31)).

### SAND-102

Verifies: [SAND-13](../dev/sandbox-image.md#sand-13)

Where `boss-sandbox:<tag>` is built, `PATH` shall start with
`/home/boss/.local/share/mise/shims:/home/boss/.local/bin:/home/boss/.local/share/npm-global/bin:/home/boss/.local/share/cargo/bin:`
([SAND-13](../dev/sandbox-image.md#sand-13)).

### SAND-103

Verifies: [SAND-32](../dev/sandbox-image.md#sand-32)

Where `boss-sandbox:<tag>` is built, `sudo -n <cmd>` inside the
container shall execute `<cmd>` unprivileged and print the rootless
context line; `sudo -u`, `sudo -g`, and `sudo -i` forms shall exit 1
with informative errors
([SAND-32](../dev/sandbox-image.md#sand-32)).

### SAND-104

Verifies: [SAND-33](../dev/sandbox-image.md#sand-33)

Where a container starts from `boss-sandbox:<tag>` with a writable
home volume, startup shall seed missing files from `/opt/defaults/`
into `$HOME` and shall not overwrite an already-existing target file
([SAND-33](../dev/sandbox-image.md#sand-33)).

### SAND-105

Verifies: [SAND-34](../dev/sandbox-image.md#sand-34)

Where a container starts from `boss-sandbox:<tag>`, startup shall
persist `BOSS_IMAGE_VERSION` in
`$XDG_STATE_HOME/.boss-image-version`. Where the stored value differs
from current `BOSS_IMAGE_VERSION`, startup logs shall include both
previous and current values
([SAND-34](../dev/sandbox-image.md#sand-34)).

### SAND-106

Verifies: [SAND-35](../dev/sandbox-image.md#sand-35), [SAND-50](../user/sandbox-image.md#sand-50)

Where `boss-sandbox:<tag>` is built, `gpg --version`,
`tree --version`, `gh --version`, and `glab --version` in the
container shall each exit 0
([SAND-35](../dev/sandbox-image.md#sand-35),
[SAND-50](../user/sandbox-image.md#sand-50)).

### SAND-107

Verifies: [SAND-31](../dev/sandbox-image.md#sand-31)

Where interactive Bash loads the default `.bashrc` in the container,
`PROMPT_COMMAND` shall include `_pip_user_venv_guard`; when
`VIRTUAL_ENV` is set then the guard shall unset `PIP_USER`, and when
`VIRTUAL_ENV` is removed after a venv-active state, the guard shall
restore `PIP_USER=1`
([DR-005 §1](../../decisions/005-package-manager-environment.md#1-xdg-environment-variables)).

### SAND-108

Verifies: [SAND-36](../dev/sandbox-image.md#sand-36)

Where a container starts from `boss-sandbox:<tag>`, startup entrypoint
shall write `$XDG_STATE_HOME/.boss-mise-reconcile.state` containing
`status`, `fingerprint`, and `should_warn` fields
([SAND-36](../dev/sandbox-image.md#sand-36)).

### SAND-109

Verifies: [SAND-29](../dev/sandbox-image.md#sand-29)

Where `boss open ~ gemini` is invoked against a running container
without gemini pre-installed, the CLI shall install gemini from the
on-demand config+lockfile and the agent binary shall be callable
afterward ([SAND-29](../dev/sandbox-image.md#sand-29)).
