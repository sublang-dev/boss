<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-003: Runtime-Profiled Authentication

## Status

Accepted

## Context

IterOn must authenticate two categories of credentials from inside the
sandbox: **agent API keys** (covered by [DR-001 §3](001-sandbox-architecture.md#3-authentication))
and **git SSH/HTTPS credentials** for cloning private repositories.

Locally, developers have host-side key
files and `.env` files; on Fargate, there is no developer host—credentials
must come from AWS Secrets Manager or short-lived tokens.

A single credential strategy cannot serve both targets: host file mounts
are unavailable on Fargate, and Secrets Manager is unnecessary overhead
locally.

## Decision

### 1. Runtime profiles

IterOn defines two **auth profiles** that select the credential backend:

| Profile | Credential source | Deployment target |
| --- | --- | --- |
| `local` | Host file system (`.env`, key mounts) | Developer workstation (Podman) |
| `aws` | Secrets Manager, ECS `secrets`, OIDC tokens | AWS Fargate + EFS |

The profile is set in `config.toml`:

```toml
[auth]
profile = "local"   # "local" | "aws"
```

The CLI UX is identical regardless of profile. Commands like
`iteron auth ssh test` work the same way; only the backend differs.

### 2. Local profile

**Agent API keys:** `.env` file at `~/.iteron/.env`, injected as
container environment variables at start
([DR-001 §3](001-sandbox-architecture.md#3-authentication)).

**Git SSH:** Opt-in single-key mount.

```toml
[auth.ssh]
mode = "off"                   # "keyfile" | "off"
keyfile = "~/.ssh/id_ed25519"  # host path; mounted read-only
```

When `mode = "keyfile"`, `iteron start` injects the specified
private key into a staging tmpfs at `/run/iteron/ssh/<basename>`.
An `IdentityFile` directive pointing to the mounted path is written
to a managed include file (`~/.ssh/config.d/iteron.conf`), preserving
any user SSH config. When mode is `"off"` or absent, the managed file
is removed to prevent stale directives from persisting on the volume.

The image pre-seeds `/etc/ssh/ssh_known_hosts` with host keys for
GitHub \[1] and GitLab.com \[6]. Users can append additional host keys by
writing to `~/.ssh/known_hosts` (persisted on the `iteron-data`
volume). `StrictHostKeyChecking yes` is enforced.

SSH agent forwarding was considered but rejected: on macOS, Podman
runs inside a managed VM \[2] and Unix socket forwarding from host
to VM is not currently supported \[3].
A reverse SSH tunnel workaround adds complexity disproportionate to
the security benefit, given that agents already have full in-container
permissions ([DR-001 §1](001-sandbox-architecture.md#1-oci-container-as-the-sandbox-boundary)).

### 3. AWS profile *(designed — not yet implemented)*

> **Status:** The `aws` profile is specified here for architectural
> completeness. The CLI currently rejects `profile = "aws"` at config
> load time.

**Agent API keys:** ECS task definition `secrets` field \[4] referencing
Secrets Manager ARNs. Rotatable. Never stored in the image, repository,
or long-lived EFS volumes.

**Git auth (preferred):** HTTPS with short-lived tokens—GitHub App
installation tokens \[5] or OIDC-minted tokens, injected as environment
variables at ECS task start. A git credential helper in the image
reads the token from the environment.

**Git SSH (if required):** Dedicated deploy key stored in Secrets
Manager, injected into ephemeral `/tmp` at task start. Never written
to EFS.

### 4. Credential hygiene (both profiles)

- No credentials baked into the image or committed to the repository.
- No long-lived secrets on persistent storage (EFS volumes, `iteron-data`).
- Local `.env` is `.gitignore`d and created by `iteron init` with
  placeholder values.
- AWS secrets are injected ephemerally and rotated independently of
  deployments.

## Consequences

- **Local simplicity** — developers opt in to SSH with one config
  line; `git clone git@...` works immediately.
- **Cloud security** — Fargate tasks use short-lived, rotatable
  credentials with no persistent secret storage.
- **Parity** — same CLI commands, same agent behavior; only the
  credential backend changes.
- **Extensible** — new profiles (e.g., `gcp`) or new credential
  types (e.g., GitLab HTTPS tokens) add backend implementations
  without changing the CLI surface.

### Rejected alternatives

| Alternative | Reason |
| --- | --- |
| SSH agent forwarding (local) | macOS Podman VM has no native socket forwarding; reverse SSH tunnel adds complexity for marginal security gain |
| Mount full `~/.ssh` directory | Over-exposes keys, config, and known_hosts beyond what is needed |
| Single auth strategy for both profiles | Host mounts unavailable on Fargate; Secrets Manager unnecessary locally |
| Credentials on EFS | Persistent secret storage violates least-privilege; rotation requires volume access |

## References

1. GitHub SSH key fingerprints — <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints>
2. Podman machine (macOS VM architecture) — <https://docs.podman.io/en/latest/markdown/podman-machine.1.html>
3. Podman macOS SSH agent socket forwarding (open feature request) — <https://github.com/containers/podman/issues/23785>
4. AWS ECS secrets injection — <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data-secrets.html>
5. GitHub Apps installation tokens — <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app>
6. GitLab SSH host keys — <https://docs.gitlab.com/user/gitlab_com/#ssh-host-keys-fingerprints>
