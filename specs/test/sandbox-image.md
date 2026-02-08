<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai> -->

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
`/home/iteron/.config/opencode/opencode.json`, and
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
