<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-001: Sandbox Architecture for CLI Coding Agents

## Status

Accepted

## Context

We need to run CLI coding agents (Claude Code, Codex CLI, Gemini CLI, OpenCode) autonomously with full permissions inside isolated sandboxes. The solution must work locally on macOS, Linux, and Windows with minimal installation friction; deploy to AWS for long-running autonomous tasks; support subscription and API-key auth; and map to Tmux outside the sandbox for user interaction.

The agents have conflicting runtimes: Gemini CLI requires Node 20+ \[1], Claude Code requires Node 18+ \[2], Codex CLI is a Rust binary available in both glibc and musl-linked variants \[3], and OpenCode is a TypeScript CLI published on npm as `opencode-ai` \[4]. Node.js 22 LTS on Debian Bookworm Slim (~30 MB \[5]) satisfies the Node-based agents; Codex CLI uses its statically-linked musl binary, which runs on any Linux regardless of the system libc. All three major agents already use internal sandboxing (Claude Code and Codex CLI use sandbox-exec on macOS \[6]\[7] and Bubblewrap on Linux \[6]\[36]; Gemini CLI uses sandbox-exec on macOS and container-based sandboxing cross-platform \[8]), but these are platform-specific, do not encapsulate runtimes or resolve dependency conflicts, and have no managed AWS equivalent. They remain useful as defense-in-depth inside the container.

## Decision

### 1. OCI container as the sandbox boundary

A single OCI image based on `node:22-bookworm-slim` packages all agent runtimes. **Podman is the container runtime**, chosen over Docker for three reasons: it is daemonless and rootless by default \[9]\[34], removing the attack surface of a privileged daemon; it has no licensing cost (Apache 2.0), whereas Docker Desktop requires paid subscriptions for companies with 250+ employees or >$10M revenue \[35]; and its daemonless architecture \[9] lets Boss stop the VM when no sandboxes are running, unlike Docker Desktop's always-on daemon (~1–3 GB idle on macOS/Windows \[28]). Boss's install script provisions Podman and manages the VM lifecycle on macOS/Windows (`podman machine init/start/stop`), so users never interact with Podman directly.

Multi-arch builds target `linux/amd64` and `linux/arm64` for Graviton \[10] and Apple Silicon. Agents run with full permissions *inside* the container. The container itself is the security boundary: `--cap-drop ALL`, `--security-opt no-new-privileges`, `--read-only` root filesystem, with writable `/tmp` and mounted volumes for workspace and agent state.

Memory leaks are documented in Claude Code (120 GB in v1.0.53 \[11]; 7.5 GB regression in v2.1.27 \[12]). Mitigations: `--memory` cgroup limits, `tini` \[13] as PID 1 for signal forwarding and zombie reaping, and swap buffers via `maxSwap` in `linuxParameters` \[14] (EC2 launch type only; not supported on Fargate).

### 2. Tmux mapping

Each agent runs inside a **named tmux session within the container**. Boss provides a host-side command that wraps `podman exec -it <container> tmux new-session -A -s <session> -c <path> <command>`, creating a new tmux session or attaching to an existing one. This gives:

- **Background persistence** — if the `exec` connection drops, the in-container tmux keeps the agent alive; the user reattaches without losing state.
- **Cross-platform** — works on macOS, Linux, and Windows (WSL2). Shared tmux sockets across the container boundary fail on non-Linux hosts due to the VM layer \[15].
- **Multi-agent observation** — a host-side tmux session can open one pane per agent.

### 3. Authentication

**Subscription auth (primary):** Each agent uses the most reliable headless mechanism for subscription-based auth:

- **Claude Code:** `claude setup-token` \[37] generates a ~1-year OAuth token on a machine with a browser (Pro/Max subscription); inject as `CLAUDE_CODE_OAUTH_TOKEN` env var. `hasCompletedOnboarding: true` in `~/.claude.json` is required to skip the first-run prompt \[18]. Direct credential forwarding is not viable: macOS stores OAuth tokens exclusively in Keychain \[38], and token refresh is broken in copied credentials \[39].
- **Codex CLI:** `codex login --device-auth` \[16] displays a URL and one-time code in the terminal; user completes auth on any browser. Works through Boss's tmux interaction. Teams/Enterprise admins must enable device-code auth \[40]. Credential forwarding via `docker cp` of `~/.codex/auth.json` is an officially documented alternative \[40] but risks token desync on concurrent host/container use (see \[41]).
- **Gemini CLI:** `NO_BROWSER=true` triggers a PKCE OAuth flow where the CLI prints an auth URL and the user pastes back the authorization code; works through Boss's tmux interaction. This env var is referenced in CLI error messages but not yet in official auth guides \[17]; a v0.18.0 regression was fixed in v0.18.4 \[42]. Google Cloud service accounts via Vertex AI \[17] serve enterprise deployments.
- **OpenCode:** Mount host `~/.local/share/opencode/auth.json` into the container \[43] (file-based, no Keychain involvement). Alternatively, inject provider env vars directly.

**API keys (fallback):** Inject per-agent keys as environment variables (`ANTHROPIC_API_KEY`, `CODEX_API_KEY` \[33] (`codex exec` only), `GEMINI_API_KEY` \[17]) via `~/.boss/.env`, AWS Secrets Manager, or Vault.

**Dynamic retrieval:** Claude Code's `apiKeyHelper` \[19] runs a script returning fresh keys on each invocation, with refresh controlled by `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`. Must not coexist with `CLAUDE_CODE_OAUTH_TOKEN`.

**Credential-injecting proxy (multi-agent):** Anthropic's secure deployment guide \[20] describes a proxy pattern: container runs with `--network none`, a mounted Unix socket connects to a host-side proxy (e.g., LiteLLM \[21] or Envoy \[22]) that injects credentials into outbound requests and enforces domain allowlists. This provides per-agent budgets and centralized audit logging.
> **Caveat:** Community reports indicate Anthropic blocks subscription (Pro/Max) OAuth tokens from proxy and third-party use as of January 2026 \[23]. The proxy pattern requires API keys, not subscription tokens.

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
| Interaction | `podman exec` | SSM / `ecs execute-command` |
| Credentials | Local `.env` or proxy | Secrets Manager + proxy |

### 6. User-local tool layer

The image installs tools that need shared libraries or complex dependency chains (e.g., git, curl, tmux, Node-based agents) via apt and npm at build time — the **image layer**. For standalone, statically-linked binaries (e.g., `gh`, `rg`, `fd`), a **user-local layer** at `~/.local/bin` provides a persistent, user-writable install target:

- `~/.local/bin` is created in the Dockerfile (owned by `boss:boss`) and prepended to `PATH` via `ENV`. This follows common user-local PATH ordering and intentionally allows user-installed binaries to shadow image-layer commands (e.g., a newer `git`). Agents debugging unexpected tool behavior should check `command -v <cmd>` for shadowed paths.
- Because `/home/boss` is backed by the `boss-data` volume, binaries placed there persist across container restarts without rebuilding the image.
- A future `tools.toml` manifest will let users declaratively list standalone tools; a reconciler will download missing binaries into `~/.local/bin` on container start. This mechanism is not yet implemented.

## Consequences

- **Easy local install** — Boss's install script provisions Podman automatically. No manual container commands needed; no KVM, Bubblewrap, or platform-specific tools.
- **No licensing cost** — Podman is Apache 2.0 \[9]. No per-seat subscription required regardless of organization size.
- **Rootless security by default** — no privileged daemon; container UIDs map to unprivileged host UIDs \[9]\[34].
- **Lighter footprint** — no idle daemon process. Boss auto-starts `podman machine` on sandbox launch and stops it when idle, reclaiming VM memory.
- **Full agent autonomy** — unrestricted shell, filesystem, and network access within the container. No permission prompts.
- **Portable security** — same OCI image locally and on Fargate; Firecracker isolation automatic in production.
- **Tmux persistence** — in-container tmux survives connection drops; users inspect agents at any time.
- **Subscription-first auth** — agents use subscription credentials headlessly via setup tokens (Claude Code), device code flow (Codex CLI), `NO_BROWSER` PKCE OAuth (Gemini CLI), and credential forwarding (OpenCode). Proxy-based credential management requires API keys, not subscription tokens \[23].
- **User-extensible tooling** — `~/.local/bin` on PATH lets users and agents install standalone binaries that persist across restarts without rebuilding the image.

### Rejected alternatives

| Alternative | Reason |
| --- | --- |
| Docker Desktop | Requires paid subscription for larger organizations \[35]; privileged daemon is an unnecessary attack surface; ~1–3 GB idle memory on macOS/Windows \[28] |
| OS-native sandboxing only | Platform-fragmented; no environment encapsulation; no AWS path \[29] |
| Firecracker locally | Requires Linux with KVM; no macOS/Windows support \[30] |
| gVisor locally | Linux-only; overhead varies by workload \[31]; doesn't solve cross-platform |
| WASM sandboxes | Node.js WASI is experimental \[32]; no production path for full agent runtimes |

## References

1. Gemini CLI requires Node 20+ — <https://www.npmjs.com/package/@google/gemini-cli>
2. Claude Code npm package — <https://www.npmjs.com/package/@anthropic-ai/claude-code>
3. Codex CLI Rust rewrite — <https://www.infoq.com/news/2025/06/codex-cli-rust-native-rewrite/>
4. OpenCode CLI (npm: opencode-ai) — <https://www.npmjs.com/package/opencode-ai>
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
29. sandbox-exec deprecated (macOS man page); still used by Bazel, SwiftPM, Claude Code, Codex CLI, Gemini CLI
30. Firecracker requires Linux+KVM — <https://github.com/firecracker-microvm/firecracker>
31. gVisor performance — <https://gvisor.dev/docs/architecture_guide/performance/>
32. Node.js WASI experimental — <https://nodejs.org/api/wasi.html>
33. Codex CLI non-interactive mode (`CODEX_API_KEY` is `codex exec` only) — <https://developers.openai.com/codex/noninteractive/>
34. Podman rootless containers — <https://developers.redhat.com/blog/2020/09/25/rootless-containers-with-podman-the-basics>
35. Docker Desktop subscription required for 250+ employees or >$10M revenue — <https://docs.docker.com/subscription/desktop-license/>
36. Codex CLI Linux sandbox (Bubblewrap, feature-gated) — <https://github.com/openai/codex/blob/main/codex-rs/linux-sandbox/README.md>
37. Claude Code `setup-token` for headless OAuth — <https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md>
38. Claude Code stores OAuth in macOS Keychain only (deletes credential file), GitHub #10039 — <https://github.com/anthropics/claude-code/issues/10039>
39. Claude Code token refresh broken in copied credentials, GitHub #21765 — <https://github.com/anthropics/claude-code/issues/21765>
40. Codex CLI device-code auth requires admin enablement — <https://developers.openai.com/codex/auth/>
41. Codex CLI single-use rotating refresh tokens, GitHub #6036 — <https://github.com/openai/codex/issues/6036>
42. Gemini CLI `NO_BROWSER` regression fixed in v0.18.4, GitHub #13853 — <https://github.com/google-gemini/gemini-cli/issues/13853>
43. OpenCode file-based credential storage (no Keychain) — <https://opencode.ai/docs/providers/>
