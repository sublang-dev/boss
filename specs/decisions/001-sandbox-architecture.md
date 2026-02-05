<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2025 SubLang International <https://www.sublang.ai> -->

# DR-001: Sandbox Architecture for CLI Coding Agents

## Status

Proposed

## Context

We need to run CLI coding agents (Claude Code, Codex CLI, Gemini CLI, OpenCode) autonomously with full permissions inside isolated sandboxes. The solution must work locally on macOS, Linux, and Windows with minimal installation friction; deploy to AWS for long-running autonomous tasks; support subscription and API-key auth; and map to Tmux outside the sandbox for user interaction.

The agents have conflicting runtimes: Gemini CLI requires Node 20+ \[1], Claude Code requires Node 18+ \[2], Codex CLI is a Rust binary linked against glibc \[3], and the active OpenCode fork (anomalyco/opencode) is TypeScript \[4]. Node.js 22 LTS on Debian Bookworm Slim (~30 MB \[5]) satisfies all four while providing the glibc Codex needs — Alpine's musl would require a compatibility layer. All three major agents already use internal sandboxing (Claude Code and Codex CLI use sandbox-exec on macOS \[6]\[7] and Bubblewrap on Linux \[6]\[38]; Gemini CLI uses sandbox-exec on macOS and container-based sandboxing cross-platform \[8]), but these are platform-specific, do not encapsulate runtimes or resolve dependency conflicts, and have no managed AWS equivalent. They remain useful as defense-in-depth inside the container.

## Decision

### 1. OCI container as the sandbox boundary

A single OCI image based on `node:22-bookworm-slim` packages all agent runtimes. **Podman is the container runtime**, chosen over Docker for three reasons: it is daemonless and rootless by default \[9]\[35], removing the attack surface of a privileged daemon; it has no licensing cost (Apache 2.0), whereas Docker Desktop requires paid subscriptions for companies with 250+ employees or >$10M revenue \[36]; and its daemonless architecture \[9] lets IterOn stop the VM when no sandboxes are running, unlike Docker Desktop's always-on daemon (~1–3 GB idle on macOS/Windows \[28]). IterOn's install script provisions Podman and manages the VM lifecycle on macOS/Windows (`podman machine init/start/stop`), so users never interact with Podman directly.

Multi-arch builds target `linux/amd64` and `linux/arm64` for Graviton \[10] and Apple Silicon. Agents run with full permissions *inside* the container. The container itself is the security boundary: `--cap-drop ALL`, `--security-opt no-new-privileges`, `--read-only` root filesystem, with writable `/tmp` and mounted volumes for workspace and agent state.

Memory leaks are documented in Claude Code (120 GB in v1.0.53 \[11]; 7.5 GB regression in v2.1.27 \[12]). Mitigations: `--memory` cgroup limits, `tini` \[13] as PID 1 for signal forwarding and zombie reaping, and swap buffers via `maxSwap` in `linuxParameters` \[14] (EC2 launch type only; not supported on Fargate).

### 2. Tmux mapping

Each agent runs inside a **named tmux session within the container**. IterOn provides a host-side command (`iteron attach <agent>`) that wraps `podman exec -it <container> tmux attach -t <agent>`, binding the host terminal to the in-container tmux session. This gives:

- **Background persistence** — if the `exec` connection drops, the in-container tmux keeps the agent alive; the user reattaches without losing state.
- **Cross-platform** — works on macOS, Linux, and Windows (WSL2). Shared tmux sockets across the container boundary fail on non-Linux hosts due to the VM layer \[15].
- **Multi-agent observation** — a host-side tmux session can open one pane per agent, each running `iteron attach`.

### 3. Authentication

**API keys (headless default):** Inject per-agent keys as environment variables (`ANTHROPIC_API_KEY`, `CODEX_API_KEY` \[16]\[34] (`codex exec` only), `GEMINI_API_KEY` \[17]) sourced from AWS Secrets Manager or Vault. Claude Code requires `hasCompletedOnboarding: true` in `~/.claude.json` to bypass the interactive first-run prompt \[18].

**Dynamic retrieval:** Claude Code's `apiKeyHelper` setting runs a script returning fresh keys on each invocation, with refresh controlled by `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` \[19].

**Credential-injecting proxy (multi-agent):** Anthropic's secure deployment guide \[20] describes a proxy pattern: container runs with `--network none`, a mounted Unix socket connects to a host-side proxy (e.g., LiteLLM \[21] or Envoy \[22]) that injects credentials into outbound requests and enforces domain allowlists. This provides per-agent budgets and centralized audit logging.
> **Caveat:** Community reports indicate Anthropic blocks subscription (Pro/Max) OAuth tokens from proxy and third-party use as of January 2026 \[23]. The proxy pattern requires API keys, not subscription tokens.

**Headless subscription auth for Codex and Gemini:** Codex CLI offers a device code flow (`codex login --device-auth`) \[16]; Gemini CLI supports Google Cloud service accounts for non-interactive auth \[17].

### 4. AWS deployment: Fargate + EFS

**Compute:** AWS Fargate provides managed container execution with Firecracker microVM isolation per task \[24]\[25]. Task definition: 2–4 vCPU, 16 GB memory, 30 GB ephemeral storage, ARM64 architecture. Note: Fargate does not support swap (`maxSwap` is EC2-only \[14]); memory limits must be sized to absorb agent leak spikes.

**Storage:** Amazon EFS \[26] over EBS — EFS is AZ-resilient (tasks can restart in any AZ without volume detach/attach), elastic (no fixed disk provisioning), and supports shared access across sandbox instances. The container mounts EFS and symlinks agent config directories (`~/.claude/`, `~/.codex/`, `~/.gemini/`) to persistent paths.

**Network:** Private subnet with NAT Gateway for outbound API access; no inbound ports; access via SSM Session Manager \[27] or `ecs execute-command`.

### 5. Local-to-cloud parity

| Concern | Local (Podman) | AWS (Fargate + EFS) |
| --- | --- | --- |
| Image | Same OCI image | Same via ECR |
| Isolation | Rootless namespace/cgroup | Firecracker microVM |
| Storage | Podman volumes | EFS mount |
| Interaction | `iteron attach` via `podman exec` | SSM / `ecs execute-command` |
| Credentials | Local `.env` or proxy | Secrets Manager + proxy |

## Consequences

- **Easy local install** — IterOn's install script provisions Podman automatically. No manual container commands needed; no KVM, Bubblewrap, or platform-specific tools.
- **No licensing cost** — Podman is Apache 2.0 \[9]. No per-seat subscription required regardless of organization size.
- **Rootless security by default** — no privileged daemon; container UIDs map to unprivileged host UIDs \[9]\[35].
- **Lighter footprint** — no idle daemon process. IterOn auto-starts `podman machine` on sandbox launch and stops it when idle, reclaiming VM memory.
- **Full agent autonomy** — unrestricted shell, filesystem, and network access within the container. No permission prompts.
- **Portable security** — same OCI image locally and on Fargate; Firecracker isolation automatic in production.
- **Tmux persistence** — in-container tmux survives connection drops; users inspect agents at any time via `iteron attach`.
- **Subscription auth friction** — community reports indicate Anthropic blocks subscription tokens from proxies \[23]; API keys required for proxy-based credential management.

### Rejected alternatives

| Alternative | Reason |
| --- | --- |
| Docker Desktop | Requires paid subscription for larger organizations \[36]; privileged daemon is an unnecessary attack surface; ~1–3 GB idle memory on macOS/Windows \[28] |
| OS-native sandboxing only | Platform-fragmented; no environment encapsulation; no AWS path \[30] |
| Firecracker locally | Requires Linux with KVM; no macOS/Windows support \[31] |
| gVisor locally | Linux-only; overhead varies by workload \[32]; doesn't solve cross-platform |
| WASM sandboxes | Node.js WASI is experimental \[33]; no production path for full agent runtimes |

## References

1. Gemini CLI requires Node 20+ — <https://www.npmjs.com/package/@google/gemini-cli>
2. Claude Code npm package — <https://www.npmjs.com/package/@anthropic-ai/claude-code>
3. Codex CLI Rust rewrite — <https://www.infoq.com/news/2025/06/codex-cli-rust-native-rewrite/>
4. OpenCode (anomalyco fork) is TypeScript — <https://github.com/anomalyco/opencode>
5. Debian Bookworm Slim ~30 MB — <https://hub.docker.com/_/debian>
6. Claude Code sandboxing — <https://www.anthropic.com/engineering/claude-code-sandboxing>
7. Codex CLI uses Apple Seatbelt on macOS — see \[3]
8. Gemini CLI sandbox — <https://google-gemini.github.io/gemini-cli/docs/cli/sandbox.html>
9. Podman: daemonless, rootless container engine (Apache 2.0) — <https://docs.podman.io/>
10. AWS Graviton — <https://aws.amazon.com/ec2/graviton/>
11. Claude Code memory leak v1.0.53, GitHub #4953 — <https://github.com/anthropics/claude-code/issues/4953>
12. Claude Code memory regression v2.1.27, GitHub #22042 — <https://github.com/anthropics/claude-code/issues/22042>
13. Tini init for containers — <https://github.com/krallin/tini>
14. Fargate swap via linuxParameters — <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html>
15. Tmux socket fails across VM boundary, GitHub #462 — <https://github.com/tmux/tmux/issues/462>
16. Codex CLI authentication — <https://developers.openai.com/codex/auth/>
17. Gemini CLI authentication — <https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.md>
18. Claude Code `hasCompletedOnboarding` bypass, GitHub #4714 — <https://github.com/anthropics/claude-code/issues/4714>
19. Claude Code authentication — <https://code.claude.com/docs/en/iam>
20. Anthropic secure deployment guide — <https://platform.claude.com/docs/en/agent-sdk/secure-deployment>
21. LiteLLM proxy — <https://docs.litellm.ai/docs/simple_proxy>
22. Envoy proxy — <https://www.envoyproxy.io/>
23. Anthropic blocks subscription tokens from third-party tools (Jan 2026; community-reported) — <https://news.ycombinator.com/item?id=46549823>
24. Fargate uses Firecracker (AWS whitepaper; disputed by a former AWS engineer, Feb 2024, but in official docs) — <https://d1.awsstatic.com/whitepapers/AWS_Fargate_Security_Overview_Whitepaper.pdf>
25. Fargate data plane — <https://aws.amazon.com/blogs/containers/under-the-hood-fargate-data-plane/>
26. Amazon EFS — <https://docs.aws.amazon.com/efs/latest/ug/how-it-works.html>
27. SSM Session Manager — <https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html>
28. Docker Desktop macOS idle memory ~1–3 GB — <https://github.com/docker/for-mac/issues/6120>
29. Apple Containerization framework (WWDC 2025; may further reduce VM overhead) — <https://thenewstack.io/what-you-need-to-know-about-apples-new-container-framework/>
30. sandbox-exec deprecated (macOS man page); still used by Bazel, SwiftPM, Claude Code, Codex CLI, Gemini CLI
31. Firecracker requires Linux+KVM — <https://github.com/firecracker-microvm/firecracker>
32. gVisor performance — <https://gvisor.dev/docs/architecture_guide/performance/>
33. Node.js WASI experimental — <https://nodejs.org/api/wasi.html>
34. Codex CLI non-interactive mode (`CODEX_API_KEY` is `codex exec` only) — <https://developers.openai.com/codex/noninteractive/>
35. Podman rootless containers — <https://developers.redhat.com/blog/2020/09/25/rootless-containers-with-podman-the-basics>
36. Docker Desktop subscription required for 250+ employees or >$10M revenue — <https://docs.docker.com/subscription/desktop-license/>
37. Podman CLI compatible with Docker — <https://podman-desktop.io/docs/migrating-from-docker/managing-docker-compatibility>
38. Codex CLI Linux sandbox (Bubblewrap, feature-gated) — <https://github.com/openai/codex/blob/main/codex-rs/linux-sandbox/README.md>
