<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2025 SubLang International <https://www.sublang.ai> -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-02-10

Major release completing iterations IR-001 through IR-004, bringing full sandbox and workspace management capabilities.

### Added

- **Workspace interaction commands** (IR-004): New commands `iteron open`, `iteron ls`, and `iteron rm` for managing tmux sessions and workspaces inside the sandbox container
- **Container lifecycle commands** (IR-002): New commands `iteron init`, `iteron start`, and `iteron stop` for managing Podman containers with automatic Podman installation
- **OCI sandbox image** (IR-001): Multi-agent sandbox image (`ghcr.io/sublang-dev/iteron-sandbox`) with Claude Code, Codex CLI, Gemini CLI, and OpenCode pre-installed
- **Comprehensive test suite** (IR-003): 101 unit tests and integration tests with GitHub Actions CI across Node.js 18/20/22 and macOS/Ubuntu/Windows
- **Container image workflow**: Automated building and publishing of sandbox images to GitHub Container Registry with dev and release tags
- **Quick start guide**: Added sandbox quick start section to README with installation and usage instructions
- **Project specifications**: Added decision records (DR-001, DR-002), iteration specs (IR-001 through IR-007), and style guides

### Changed

- **Package name migration**: Renamed npm package from `@sublang-xyz/iteron` to `@sublang/iteron` to align with new `@sublang` npm organization
- **GitHub organization**: Updated repository URLs from `sublang-xyz` to `sublang-dev` organization
- **Domain references**: Updated all references from `sublang.xyz` to `sublang.ai`
- **Session naming**: Centralized tmux session naming logic with `@` delimiter for better compatibility across platforms

### Fixed

- **Test compatibility**: Skip tmux-dependent tests when tmux is unavailable on the system
- **Session delimiter**: Changed from `:` to `@` as tmux session delimiter to avoid conflicts with tmux's own syntax
- **DR-001 specification**: Decoupled tmux session mapping from CLI command names for better flexibility
- **Architecture documentation**: Corrected factual errors in DR-001 sandbox architecture decision record

## [0.1.2] - 2026-01-25

### Changed

- **BREAKING:** Renamed `iteron init` command to `iteron scaffold` to reserve `init` for future full project initialization
- Updated copyright URL to www.sublang.ai in SPDX headers
- Updated AI co-author email to cligent@sublang.ai in git spec

## [0.1.1] - 2025-01-14

First public release of IterOn - a CLI tool that delegates dev loops to Claude Code and Codex CLI, enabling autonomous iteration for hours without API keys.

Install with `npm install -g @sublang/iteron`.

### Added

- CLI tool (`iteron`) for delegating dev loops
- Autonomous iteration without API keys via Claude Code and Codex CLI
- Scaffolding templates for project setup
- GitHub Actions CI workflow
- Project specifications structure

[Unreleased]: https://github.com/sublang-dev/IterOn/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/sublang-dev/IterOn/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/sublang-dev/IterOn/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/sublang-dev/IterOn/releases/tag/v0.1.1
