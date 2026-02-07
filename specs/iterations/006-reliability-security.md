<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai> -->

# IR-006: Reliability, Security, and Documentation

## Goal

Validate that the local sandbox survives extended autonomous agent runs (8 hours) without OOM kills, passes security hardening checks, has no critical/high CVEs, and is fully documented for end users.

## Deliverables

- [ ] Memory leak mitigation validated (8-hour autonomous run)
- [ ] Security hardening validated (rootless, cap-drop, read-only, no-new-privileges)
- [ ] Vulnerability scan clean (no critical/high CVEs)
- [ ] Documentation: installation guide, CLI reference, agent configuration, workspace guide, troubleshooting

## Tasks

### 1. Memory leak mitigation validation

Per [DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary):

- Verify `--memory 16g` cgroup limit is enforced:
  - `podman stats --no-stream --format '{{.MemLimit}}' iteron-sandbox` → `16 GB`
- Run Claude Code autonomously for 8 hours on a looping task (e.g., iterative refactoring of a test project)
- Sample memory every 15 minutes: `podman stats --no-stream --format '{{.MemUsage}}' iteron-sandbox >> mem.log`
- Verify tini reaps zombie processes after agent exit:
  - `podman exec iteron-sandbox ps aux | grep -c defunct` → `0`
- Test container restart after OOM:
  - `iteron stop && iteron start` succeeds; `iteron-data` volume intact

### 2. Security hardening validation

Per [DR-001 §1](../decisions/001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary):

- Rootless mode: `podman info --format '{{.Host.Security.Rootless}}'` → `true`
- Capabilities dropped: `podman inspect iteron-sandbox --format '{{.HostConfig.CapDrop}}'` → contains `ALL`
- Read-only root: `podman inspect iteron-sandbox --format '{{.HostConfig.ReadonlyRootfs}}'` → `true`
- No-new-privileges: `podman inspect iteron-sandbox --format '{{.HostConfig.SecurityOpt}}'` → contains `no-new-privileges`
- Write outside allowed paths: `podman exec iteron-sandbox touch /usr/local/test` → exit 1, `Read-only file system`
- Write to allowed paths: `podman exec iteron-sandbox touch /tmp/test && podman exec iteron-sandbox touch /home/iteron/test` → both exit 0

### 3. Vulnerability scan

- Run Trivy on the OCI image: `trivy image ghcr.io/sublang/iteron-sandbox:<version>`
- Run Grype as cross-check: `grype ghcr.io/sublang/iteron-sandbox:<version>`
- Expected: no critical or high severity CVEs
- Document any accepted medium/low CVEs with justification

### 4. Documentation

- **Installation guide**: step-by-step `iteron init` on macOS, Linux, WSL2 with expected terminal output
- **CLI reference**: all 6 commands (`init`, `start`, `stop`, `open`, `ls`, `rm`) with options, examples, and exit codes
- **Agent configuration**: API key setup per agent, `hasCompletedOnboarding`, `apiKeyHelper`, subscription auth alternatives
- **Workspace guide**: creating workspaces, running multiple agents, `iteron ls` output interpretation, `iteron rm` cleanup
- **Tmux quick reference**: detach (`Ctrl-B D`), reattach (`iteron open`), pane splits, scrollback, custom `~/.tmux.conf`
- **Troubleshooting**: Podman not installed, container not running, OOM, auth failures, agent permission prompts

## Verification

| # | Test | Expected |
| --- | --- | --- |
| 1 | `podman stats --no-stream --format '{{.MemLimit}}' iteron-sandbox` | `16 GiB` (or equivalent) |
| 2 | 8-hour Claude Code run; `max(mem.log)` | Memory peak < 16 GB (no OOM kill) |
| 3 | After 8-hour run: `podman exec iteron-sandbox ps aux \| grep -c defunct` | `0` (no zombie processes) |
| 4 | `iteron stop && iteron start` after 8-hour run; `podman exec iteron-sandbox ls /home/iteron/` | Previous workspace data intact |
| 5 | `podman info --format '{{.Host.Security.Rootless}}'` | `true` |
| 6 | `podman inspect iteron-sandbox --format '{{.HostConfig.CapDrop}}'` | Contains `ALL` |
| 7 | `podman inspect iteron-sandbox --format '{{.HostConfig.ReadonlyRootfs}}'` | `true` |
| 8 | `podman inspect iteron-sandbox --format '{{.HostConfig.SecurityOpt}}'` | Contains `no-new-privileges` |
| 9 | `podman exec iteron-sandbox touch /usr/local/test` | Exit 1, `Read-only file system` |
| 10 | `trivy image <image> --severity CRITICAL,HIGH --exit-code 1` | Exit 0 (no critical/high CVEs) |
| 11 | New user follows installation guide from step 1 to running `iteron open claude-code` | Completes without external help; agent prompt appears |
| 12 | CLI reference documents all 6 commands | Each command has: synopsis, options, examples, exit codes |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Claude Code memory leak exceeds 16 GB during 8h run | Container OOM-killed, task lost | `--memory` cgroup limit prevents host impact; container restartable; volume data preserved |
| Agent version update introduces new CVE in image | Vulnerability scan fails | Pin agent versions; re-scan on each image rebuild |
| Upstream agent changes break headless config | Permission prompts reappear | Pin versions; regression test in [IR-005](005-autonomous-execution.md) catches this |

## Non-Goals

- AWS deployment (Fargate, EFS, Secrets Manager)
- Per-agent resource limits within container
- Automated CI/CD pipeline for image builds and vulnerability scanning
- Performance benchmarking or optimization

## Dependencies

- [IR-005](005-autonomous-execution.md) (agents must pass autonomous execution before reliability testing)
- [DR-001](../decisions/001-sandbox-architecture.md) approved
