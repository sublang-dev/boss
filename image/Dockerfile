# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

FROM node:22-bookworm-slim

# ---------- system packages ----------
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tini tmux bash git curl jq ca-certificates openssh-client \
 && rm -rf /var/lib/apt/lists/*

# ---------- npm agents ----------
RUN npm install -g \
      @anthropic-ai/claude-code \
      @google/gemini-cli \
      opencode-ai \
 && npm install -g npm@11.10.0 \
 && npm cache clean --force

# ---------- Codex CLI (standalone musl binary) ----------
ARG CODEX_VERSION=0.98.0
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) arch=x86_64  ;; \
      arm64) arch=aarch64  ;; \
      *)     echo "unsupported arch: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/codex-${arch}-unknown-linux-musl.tar.gz" \
      | tar xz -C /usr/local/bin/ \
 && mv "/usr/local/bin/codex-${arch}-unknown-linux-musl" /usr/local/bin/codex \
 && chmod +x /usr/local/bin/codex

# ---------- verify binaries ----------
RUN claude --version \
 && codex --version \
 && gemini --version \
 && opencode --version

# ---------- non-root user ----------
# node:22-bookworm-slim ships uid=1000/gid=1000 as "node"; rename to "iteron"
RUN groupmod -n iteron node \
 && usermod -l iteron -d /home/iteron -m -s /bin/bash node

# ---------- remove SUID/SGID ----------
RUN find / -perm /6000 -type f -exec chmod a-s {} + 2>/dev/null || true

# ---------- user-local tool layer ----------
RUN mkdir -p /home/iteron/.local/bin \
 && chown -R iteron:iteron /home/iteron/.local
ENV PATH="/home/iteron/.local/bin:${PATH}"

# ---------- container defaults ----------
ENV NO_BROWSER=true

# ---------- agent autonomy configs ----------
COPY --chown=iteron:iteron conf/claude.json          /home/iteron/.claude.json
COPY --chown=iteron:iteron conf/claude-settings.json  /home/iteron/.claude/settings.json
COPY --chown=iteron:iteron conf/codex-config.toml     /home/iteron/.codex/config.toml
COPY --chown=iteron:iteron conf/gemini-settings.json  /home/iteron/.gemini/settings.json
COPY --chown=iteron:iteron conf/opencode.json         /home/iteron/.config/opencode/opencode.json
# ---------- SSH known hosts + strict checking (DR-003 §2) ----------
COPY conf/ssh_known_hosts                               /etc/ssh/ssh_known_hosts
COPY conf/ssh_config                                    /etc/ssh/ssh_config.d/iteron.conf

COPY conf/tmux-system.conf                             /etc/tmux.conf
COPY --chown=iteron:iteron conf/tmux.conf             /home/iteron/.tmux.conf

USER iteron
WORKDIR /home/iteron

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash"]
