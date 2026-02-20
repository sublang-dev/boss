# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

FROM node:22-bookworm-slim

# ---------- system packages ----------
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tini tmux bash git curl jq ca-certificates openssh-client locales \
 && sed -i 's/^# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen \
 && locale-gen \
 && rm -rf /var/lib/apt/lists/*
ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

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
# node:22-bookworm-slim ships uid=1000/gid=1000 as "node"; rename to "iteron"
RUN groupmod -n iteron node \
 && usermod -l iteron -d /home/iteron -m -s /bin/bash node

# ---------- remove SUID/SGID ----------
RUN find / -perm /6000 -type f -exec chmod a-s {} + 2>/dev/null || true

# ---------- user-local tool layer ----------
RUN mkdir -p /home/iteron/.local/bin \
 && chown -R iteron:iteron /home/iteron/.local
ENV PATH="/home/iteron/.local/share/mise/shims:/home/iteron/.local/bin:${PATH}"

# ---------- mise system config + lockfile (root phase) ----------
COPY conf/mise-system.toml /etc/mise/config.toml
RUN mise lock

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

# ---------- mise user-global config template ----------
COPY --chown=iteron:iteron conf/mise-user.toml /home/iteron/.config/mise/config.toml

# ---------- mise tool installation (iteron phase) ----------
# Allow iteron to update lockfile during install (rootfs is read-only at runtime)
RUN chown iteron:iteron /etc/mise /etc/mise/mise.lock

USER iteron
WORKDIR /home/iteron
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
