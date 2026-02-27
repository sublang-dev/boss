# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

FROM node:22-bookworm-slim

ARG NPM_VERSION=11.11.0

# ---------- system packages ----------
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tini tmux bash git curl jq ca-certificates openssh-client locales \
 && sed -i 's/^# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen \
 && locale-gen \
 && rm -rf /var/lib/apt/lists/*
ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# Keep npm's bundled dependency set on a patched release.
RUN npm install -g "npm@${NPM_VERSION}" --no-audit --no-fund \
 && npm --version

# ---------- mise (user-space tool manager, DR-004) ----------
ARG MISE_VERSION=2026.2.16
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) arch=x64   ;; \
      arm64) arch=arm64  ;; \
      *)     echo "unsupported arch: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/jdx/mise/releases/download/v${MISE_VERSION}/mise-v${MISE_VERSION}-linux-${arch}-musl.tar.gz" \
      | tar xz -C /usr/local --strip-components=1 \
 && mise --version

# ---------- non-root user ----------
# node:22-bookworm-slim ships uid=1000/gid=1000 as "node"; rename to "boss"
RUN groupmod -n boss node \
 && usermod -l boss -d /home/boss -m -s /bin/bash node

# ---------- remove SUID/SGID ----------
RUN find / -perm /6000 -type f -exec chmod a-s {} + 2>/dev/null || true

# ---------- user-local tool layer ----------
RUN mkdir -p /home/boss/.local/bin \
 && chown -R boss:boss /home/boss/.local
ENV PATH="/home/boss/.local/share/mise/shims:/home/boss/.local/bin:${PATH}"

# ---------- mise system config + lockfile (root phase) ----------
COPY conf/mise-system.toml /etc/mise/config.toml
RUN --mount=type=secret,id=GITHUB_TOKEN \
    if [ -f /run/secrets/GITHUB_TOKEN ]; then \
      export GITHUB_TOKEN="$(cat /run/secrets/GITHUB_TOKEN)"; \
    fi \
 && mise lock

# ---------- container defaults ----------
ENV NO_BROWSER=true

# ---------- agent autonomy configs ----------
COPY --chown=boss:boss conf/claude.json          /home/boss/.claude.json
COPY --chown=boss:boss conf/claude-settings.json  /home/boss/.claude/settings.json
COPY --chown=boss:boss conf/codex-config.toml     /home/boss/.codex/config.toml
COPY --chown=boss:boss conf/gemini-settings.json  /home/boss/.gemini/settings.json
COPY --chown=boss:boss conf/opencode.json         /home/boss/.config/opencode/opencode.json
# ---------- SSH known hosts + strict checking (DR-003 §2) ----------
COPY conf/ssh_known_hosts                               /etc/ssh/ssh_known_hosts
COPY conf/ssh_config                                    /etc/ssh/ssh_config.d/boss.conf

COPY conf/tmux-system.conf                             /etc/tmux.conf
COPY --chown=boss:boss conf/tmux.conf             /home/boss/.tmux.conf

# ---------- mise user-global config template ----------
COPY --chown=boss:boss conf/mise-user.toml /home/boss/.config/mise/config.toml

# ---------- mise tool installation (boss phase) ----------
# Allow boss to update lockfile during install (rootfs is read-only at runtime)
RUN chown boss:boss /etc/mise /etc/mise/mise.lock

USER boss
WORKDIR /home/boss
RUN mise trust /etc/mise/config.toml \
 && mise install --locked \
 && mise reshim

# ---------- verify agent binaries ----------
RUN claude --version \
 && codex --help > /dev/null \
 && gemini --version \
 && opencode --version

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash"]
