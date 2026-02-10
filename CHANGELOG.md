<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2025 SubLang International <https://www.sublang.ai> -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-02-10

### Changed

- Migrated npm package name from `@sublang-dev/iteron` to `@sublang/iteron`

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
