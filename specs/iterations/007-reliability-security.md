<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-007: Reliability, Security, and Documentation

## Goal

Validate that the local sandbox passes security hardening checks, has no unfixed critical/high CVEs (accepted OS CVEs with no upstream fix are tracked in `image/.trivyignore`), and is fully documented for end users.

## Deliverables

- [x] Security hardening validated (rootless, cap-drop, read-only, no-new-privileges)
- [x] Vulnerability scan clean (no critical/high CVEs) — npm CVEs fixed; 5 accepted OS CVEs in `image/.trivyignore`
- [x] Documentation: installation guide, CLI reference, agent configuration, workspace guide, troubleshooting
- [x] User-local binary directory (`~/.local/bin`) on PATH

## Tasks

### 1. Security hardening validation

Per [DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary):

- Rootless mode: `podman info --format '{{.Host.Security.Rootless}}'` → `true`
- Capabilities dropped: `podman inspect iteron-sandbox --format '{{.HostConfig.CapDrop}}'` → contains `ALL`
- Read-only root: `podman inspect iteron-sandbox --format '{{.HostConfig.ReadonlyRootfs}}'` → `true`
- No-new-privileges: `podman inspect iteron-sandbox --format '{{.HostConfig.SecurityOpt}}'` → contains `no-new-privileges`
- Write outside allowed paths: `podman exec iteron-sandbox touch /usr/local/test` → exit 1, `Read-only file system`
- Write to allowed paths: `podman exec iteron-sandbox touch /tmp/test && podman exec iteron-sandbox touch /home/iteron/test` → both exit 0

Already covered by integration tests in `tests/integration/start-stop.test.ts` (IR-002 tests 4–6): cap-drop ALL, read-only rootfs, no-new-privileges. Rootless mode is a host Podman property verified by `iteron init`.

### 2. Vulnerability scan

- Run Trivy on the OCI image: `trivy image ghcr.io/sublang-dev/iteron-sandbox:<version>`
- CI integration: Trivy scan step in `.github/workflows/image.yml` fails on CRITICAL/HIGH outside `image/.trivyignore`
- Local scan: `scripts/scan-image.sh` runs Trivy against local or registry image
- Expected: no critical or high severity CVEs outside the accepted list (`image/.trivyignore`)
- Document any accepted CVEs with justification in `image/.trivyignore` and the scan results below

**Scan results** (local rebuild, 2026-02-16, Trivy 0.69.1):

npm CVEs (tar, glob) fixed by pinning npm@11.10.0 in Dockerfile. Remaining OS-level CVEs have no fix in Debian Bookworm:

| CVE | Severity | Package | Installed | Fixed | Status |
| --- | --- | --- | --- | --- | --- |
| CVE-2023-45853 | CRITICAL | zlib1g | 1:1.2.13.dfsg-1 | n/a | `will_not_fix` by Debian; minizip function not used by agents |
| CVE-2023-2953 | HIGH | libldap-2.5-0 | 2.5.13+dfsg-5 | n/a | No Bookworm fix; transitive dep of git via libcurl |
| CVE-2025-48384 | HIGH | git | 1:2.39.5-0+deb12u3 | n/a | No Bookworm fix; requires crafted repo (residual risk: no enforcement prevents cloning untrusted repos) |
| CVE-2025-48385 | HIGH | git | 1:2.39.5-0+deb12u3 | n/a | No Bookworm fix; same as above |
| CVE-2026-0861 | HIGH | libc-bin | 2.36-9+deb12u13 | n/a | No Bookworm fix; mitigated by container isolation |

**Mitigation:** All 5 CVEs are in OS packages with no upstream Bookworm fix. Container hardening (cap-drop ALL, read-only rootfs, no-new-privileges, rootless mode) limits exploitability. Reassess on base image upgrade to Debian Trixie or Node 24.

### 3. Documentation

- **Installation guide** (`docs/install.md`): step-by-step `iteron init` on macOS, Linux, WSL2 with expected terminal output
- **CLI reference** (`docs/cli-reference.md`): all 7 commands (`scaffold`, `init`, `start`, `stop`, `open`, `ls`, `rm`) with options, examples, and exit codes
- **Agent configuration** (`docs/agents.md`): API key setup per agent, `hasCompletedOnboarding`, `apiKeyHelper`, subscription auth alternatives
- **Workspace guide** (`docs/workspaces.md`): creating workspaces, running multiple agents, `iteron ls` output interpretation, `iteron rm` cleanup
- **Tmux quick reference** (`docs/tmux.md`): detach (`Ctrl-B D`), reattach (`iteron open`), pane splits, scrollback, custom `~/.tmux.conf`
- **Troubleshooting** (`docs/troubleshooting.md`): Podman not installed, container not running, OOM, auth failures, agent permission prompts

### 4. User-local binary directory

Per [DR-001 §6](../decisions/001-sandbox-architecture.md#6-user-local-tool-layer): `~/.local/bin` provides a persistent, user-writable directory for standalone binaries.

- Create `~/.local/bin` in the Dockerfile, owned by `iteron:iteron`
- Add `ENV PATH="/home/iteron/.local/bin:${PATH}"` so binaries placed there are found by name
- The directory persists via the `iteron-data` volume mount at `/home/iteron`

## Verification

| # | Test | Expected |
| --- | --- | --- |
| 1 | `podman info --format '{{.Host.Security.Rootless}}'` | `true` |
| 2 | `podman inspect iteron-sandbox --format '{{.HostConfig.CapDrop}}'` | Contains `ALL` |
| 3 | `podman inspect iteron-sandbox --format '{{.HostConfig.ReadonlyRootfs}}'` | `true` |
| 4 | `podman inspect iteron-sandbox --format '{{.HostConfig.SecurityOpt}}'` | Contains `no-new-privileges` |
| 5 | `podman exec iteron-sandbox touch /usr/local/test` | Exit 1, `Read-only file system` |
| 6 | `trivy image <image> --severity CRITICAL,HIGH --exit-code 1 --ignorefile image/.trivyignore` | Exit 0 (no critical/high CVEs outside accepted list) |
| 7 | New user follows installation guide from step 1 to running `iteron open claude` | Completes without external help; agent prompt appears |
| 8 | CLI reference documents all 7 commands | Each command has: synopsis, options, examples, exit codes |
| 9 | `podman run --rm <image> test -d /home/iteron/.local/bin -a -w /home/iteron/.local/bin` | Exit 0 |
| 10 | `podman run --rm <image> sh -c 'cp /usr/bin/true ~/.local/bin/mytool && mytool'` | Exit 0 |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Agent version update introduces new CVE in image | Vulnerability scan fails | Pin agent versions; re-scan on each image rebuild |
| Upstream agent changes break headless config | Permission prompts reappear | Pin versions; regression test in [IR-006](006-autonomous-execution.md) catches this |

## Dependencies

- [IR-006](006-autonomous-execution.md) (agents must pass autonomous execution before reliability testing)
- [DR-001](../decisions/001-sandbox-architecture.md) approved
