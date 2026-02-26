<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-009: DR-005 Rollout + Developer CLI Baseline

## Goal

Implement [DR-005](../decisions/005-package-manager-environment.md) end-to-end in runtime behavior, then preinstall a baseline set of developer CLIs in the image (`gpg`, `tree`, `gh`, `glab`) with explicit channel ownership.

## Deliverables

- [ ] DR-005 package-manager environment variables implemented in image `ENV`
- [ ] DR-005 sudo no-op shim installed at `/usr/local/bin/sudo`
- [ ] DR-005 defaults seeding from `/opt/defaults/` implemented on every container start
- [ ] DR-005 image-version marker (`BOSS_IMAGE_VERSION`) persisted to `$XDG_STATE_HOME/.boss-image-version`
- [ ] Baseline developer CLIs preinstalled and verified:
  - apt: `gpg`, `tree`
  - mise (`github:`): `gh`, `glab`
- [ ] Spec and test updates for DR-005 rollout and baseline CLI availability

## Tasks

### 1. Implement DR-005 runtime environment configuration

- Add DR-005 environment variables to `image/Dockerfile` (`XDG_*`, `PYTHONUSERBASE`, `PIP_USER`, `NPM_CONFIG_PREFIX`, `GOPATH`, `GOBIN`, `CARGO_HOME`, `RUSTUP_HOME`).
- Update image `PATH` order to DR-005 canonical prefix:
  `~/.local/share/mise/shims:~/.local/bin:~/.local/share/npm-global/bin:~/.local/share/cargo/bin:$PATH`.
- Ensure defaults seeded via `/opt/defaults/` include the DR-005 interactive Bash `PROMPT_COMMAND` guard for venv transitions.

### 2. Implement DR-005 sudo no-op shim

- Add a shim script in `image/conf/` and install it to `/usr/local/bin/sudo`.
- Match DR-005 flag behavior and error cases; emit the DR-005 context line on pass-through execution.

### 3. Implement DR-005 startup bootstrap with a single path

- Use an **entrypoint wrapper** (not `boss start` coupling) as the implementation path.
- On each container start:
  - seed missing files from `/opt/defaults/` into `$HOME` (file-granular, non-overwriting),
  - persist `$BOSS_IMAGE_VERSION` to `$XDG_STATE_HOME/.boss-image-version`,
  - log previous/current version when changed,
  - then `exec` the requested command.

### 4. Preinstall baseline developer CLIs

- apt channel: install `gpg` and `tree`.
- mise channel: declare/install `github:cli/cli` (`gh`) and `github:gl-cli/glab` (`glab`) in system config and lockfile.

Rationale for `gh` channel choice:

- Debian Bookworm `gh` is `2.23.0+dfsg1-1`; upstream GitHub CLI releases are substantially newer and move faster than Debian stable cadence.
- For agent compatibility with newer CLI flags/features, preinstall from mise `github:` and lock exact version.

Rationale for `gpg` package choice:

- `gpg` (the gnupg core binary package) provides the core CLI with lower footprint than the `gnupg` meta-package.
- `gnupg` pulls additional components (`dirmngr`, `gpg-agent`, `gpgsm`, etc.) that are not required for baseline signing/verification workflows.

### 5. Update specs for DR-005 parity

- Update `SBD-014` to reflect full DR-005 PATH prefix (including npm-global and cargo bin segments).
- Add/adjust sandbox-image requirements for:
  - sudo shim existence/behavior,
  - defaults seeding semantics,
  - image version marker behavior,
  - baseline CLI availability (`gpg`, `tree`, `gh`, `glab`).
- Add user-facing behavior specs only for baseline CLI availability on `PATH`; keep runtime package-manager path/shim/seeding behavior in dev and test specs.

### 6. Update tests

- Add integration checks for:
  - DR-005 env/path behavior,
  - sudo shim pass-through and blocked flags,
  - defaults seeding (copy missing, preserve existing),
  - version marker change logging,
  - baseline CLI command availability.
- Add explicit venv guard verification:
  - activate venv in interactive Bash, guard unsets `PIP_USER`,
  - deactivate venv, guard restores `PIP_USER=1`.

## Verification

| # | Test | Expected |
| --- | --- | --- |
| 1 | Build image with DR-005 changes | Build exits 0 |
| 2 | `gpg --version` | Exit 0 |
| 3 | `tree --version` | Exit 0 |
| 4 | `gh --version` | Exit 0 and version is from mise-managed install |
| 5 | `glab --version` | Exit 0 and version is from mise-managed install |
| 6 | `echo "$PATH"` in container | Prefix matches DR-005 order (mise shims, `.local/bin`, npm-global/bin, cargo/bin, then system path) |
| 7 | Run `python -m site --user-base`, `npm config get prefix`, `go env GOPATH GOBIN`, and `echo "$CARGO_HOME"` inside container | All reported paths are under `~/.local` (no network install required and no sudo) |
| 8 | Interactive Bash venv flow (`activate` then `deactivate`) | `PIP_USER` unset in venv and restored to `1` after leaving venv |
| 9 | `sudo -E <cmd>` and `sudo -n <cmd>` | Command runs unprivileged and prints DR-005 context line |
| 10 | `sudo -u root <cmd>` / `sudo -g root <cmd>` / `sudo -i` | Exit 1 with DR-005 shim errors |
| 11 | Start with missing defaults file | File is seeded from `/opt/defaults/` |
| 12 | Start with existing defaults file | Existing file is not overwritten |
| 13 | Start with changed `BOSS_IMAGE_VERSION` vs state file | Logs previous/current versions and updates marker file |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `gh`/`glab` GitHub release asset naming changes break mise resolution | Build-time or reconciliation failure | Pin via lockfile and add explicit platform asset patterns if upstream naming drifts |
| Additional baseline tools increase image size | Could pressure SBD-008 budget | Keep baseline minimal; validate compressed size in CI after rollout |
| DR-005 bootstrap logic overwrites user files | User config loss | Use file-granular copy with existence guard exactly as DR-005 specifies |
| Mixed apt/mise baseline channels confuse maintainers | Incorrect upgrade assumptions | Document channel ownership in specs/docs and enforce via tests |

## References

1. [DR-005](../decisions/005-package-manager-environment.md)
2. [DR-004](../decisions/004-user-tool-provisioning.md)
3. Debian package `gpg` (bookworm): <https://packages.debian.org/bookworm/gpg>
4. Debian package `tree` (bookworm): <https://packages.debian.org/bookworm/tree>
5. Debian package `gh` (bookworm): <https://packages.debian.org/bookworm/gh>
6. GitHub CLI releases (latest): <https://github.com/cli/cli/releases/latest>
7. Debian package `glab` (bookworm-backports): <https://packages.debian.org/bookworm-backports/glab>
8. GitLab CLI docs: <https://docs.gitlab.com/cli/>
9. Debian package `gnupg` (bookworm): <https://packages.debian.org/bookworm/gnupg>
