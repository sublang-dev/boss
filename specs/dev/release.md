<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://github.com/sublang-xyz> -->

# RELEASE: Release Workflow

This component defines release workflow rules for the project.

## Versioning

### RELEASE-001

The project shall follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html): `MAJOR.MINOR.PATCH` where MAJOR indicates breaking changes, MINOR indicates new features, and PATCH indicates bug fixes.

### RELEASE-002

The version in `package.json` shall match the git tag (without the `v` prefix). The release workflow shall verify this match before publishing.

## Changelog

### RELEASE-003

All notable changes shall be documented in `CHANGELOG.md` following the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

### RELEASE-004

Before creating a release tag, the developer/agent shall:

1. Add a new version section to `CHANGELOG.md` with the release date
2. Move items from `[Unreleased]` to the new version section
3. Update the comparison links at the bottom of the file

### RELEASE-005

Changelog entries shall be grouped under these headings (in order): `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## Release Process

### RELEASE-006

Releases shall be triggered by pushing a git tag matching the pattern `v*` (e.g., `v1.0.0`).

### RELEASE-007

The release workflow shall:

1. Verify tag version matches `package.json` version
2. Build and validate the package
3. Extract release notes from `CHANGELOG.md`
4. Publish to npm with provenance attestation
5. Create a GitHub release with the extracted notes

### RELEASE-008

npm packages shall be published with `--provenance` flag for supply chain security, generating a signed attestation linking the package to its source repository and build.

## Pre-release Checklist

### RELEASE-009

Before tagging a release, the developer/agent shall verify:

- [ ] All tests pass
- [ ] `CHANGELOG.md` is updated with the new version and date
- [ ] `package.json` version is bumped
- [ ] All changes are committed and pushed to `main`
