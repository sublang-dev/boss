<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LCD: User-Facing Lifecycle Behavior

## Intent

This spec defines user-visible behavior of Boss lifecycle commands
(`init`, `start`, `stop`).

## Initialization

### LCD-8

Where a user runs `boss init`, the CLI shall perform one-time
environment setup: install Podman (with confirmation), initialize
and start a Podman machine on macOS, verify rootless mode, generate
`~/.boss/config.toml` and `~/.boss/.env`, pull the sandbox OCI
image, and create the data volume
([DR-002 §1](../../decisions/002-iteron-cli-commands.md#1-boss-init)).

### LCD-9

Where a user runs `boss init --image <url>`, the CLI shall use the
specified image instead of the default and persist it in
`~/.boss/config.toml`
([DR-002 §1](../../decisions/002-iteron-cli-commands.md#1-boss-init)).

### LCD-10

Where a user runs `boss init` and a step has already been completed,
the CLI shall skip that step with a `(skipped)` status indicator,
making the command idempotent
([DR-002 §1](../../decisions/002-iteron-cli-commands.md#1-boss-init)).

### LCD-11

Where a user runs `boss init` and Podman is not installed, the CLI
shall prompt for confirmation before installing unless `-y`/`--yes`
is passed. When the user declines, the CLI shall exit non-zero with
a message advising manual installation.

## Starting the Sandbox

### LCD-12

Where a user runs `boss start`, the CLI shall launch the sandbox
container and print a confirmation message indicating the container
is running
([DR-002 §2](../../decisions/002-iteron-cli-commands.md#2-boss-start)).

### LCD-13

Where a user runs `boss start` and the container is already running,
the CLI shall print a message indicating this and exit successfully
without restarting the container.

### LCD-14

Where a user runs `boss start` and no Podman machine exists (macOS),
the CLI shall exit non-zero with a message suggesting `boss init`.

## Stopping the Sandbox

### LCD-15

Where a user runs `boss stop`, the CLI shall stop and remove the
sandbox container, then print a confirmation message
([DR-002 §3](../../decisions/002-iteron-cli-commands.md#3-boss-stop)).

### LCD-16

Where a user runs `boss stop` and the container is not running,
the CLI shall print a message indicating this and exit successfully.

## Error Handling

### LCD-17

Where any lifecycle command encounters an unrecoverable error, the
CLI shall print an error message to stderr and exit non-zero.
