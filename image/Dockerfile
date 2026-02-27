# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

FROM node:22-bookworm-slim

# Docker build must pass the npm package version.
ARG BOSS_VERSION
RUN test -n "${BOSS_VERSION}"

# ---------- system packages ----------
RUN echo 'deb http://deb.debian.org/debian bookworm-backports main' > /etc/apt/sources.list.d/bookworm-backports.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      tini tmux bash git curl jq ca-certificates openssh-client locales gpg tree glab/bookworm-backports \
 && sed -i 's/^# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen \
 && locale-gen \
 && rm -rf /var/lib/apt/lists/*
ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
ENV BOSS_IMAGE_VERSION="${BOSS_VERSION}"
ENV XDG_CONFIG_HOME=/home/boss/.config
ENV XDG_CACHE_HOME=/home/boss/.cache
ENV XDG_DATA_HOME=/home/boss/.local/share
ENV XDG_STATE_HOME=/home/boss/.local/state
ENV PYTHONUSERBASE=/home/boss/.local
ENV PIP_USER=1
ENV NPM_CONFIG_PREFIX=/home/boss/.local/share/npm-global
ENV GOPATH=/home/boss/.local/share/go
ENV GOBIN=/home/boss/.local/bin
ENV CARGO_HOME=/home/boss/.local/share/cargo
ENV RUSTUP_HOME=/home/boss/.local/share/rustup

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
 && if [ -d /home/boss ]; then \
      usermod -l boss -d /home/boss -s /bin/bash node; \
    else \
      usermod -l boss -d /home/boss -m -s /bin/bash node; \
    fi

# ---------- remove SUID/SGID ----------
RUN find / -perm /6000 -type f -exec chmod a-s {} + 2>/dev/null || true

# ---------- sudo shim + entrypoint ----------
COPY conf/sudo-shim.sh /usr/local/bin/sudo
COPY conf/entrypoint.sh /usr/local/bin/boss-entrypoint.sh
RUN chmod 0555 /usr/local/bin/sudo /usr/local/bin/boss-entrypoint.sh

# ---------- user-local tool layer ----------
RUN mkdir -p /home/boss/.local/bin /home/boss/.local/state \
 && chown -R boss:boss /home/boss/.local
ENV PATH="/home/boss/.local/share/mise/shims:/home/boss/.local/bin:/home/boss/.local/share/npm-global/bin:/home/boss/.local/share/cargo/bin:${PATH}"

# ---------- DR-005 interactive venv guard ----------
COPY conf/bashrc-venv-guard.sh /tmp/bashrc-venv-guard.sh
RUN test -f /home/boss/.bashrc || touch /home/boss/.bashrc \
 && cat /tmp/bashrc-venv-guard.sh >> /home/boss/.bashrc \
 && rm /tmp/bashrc-venv-guard.sh \
 && chown boss:boss /home/boss/.bashrc

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

# ---------- defaults layer (seeded into volume at container start) ----------
RUN mkdir -p /opt/defaults/.claude /opt/defaults/.codex /opt/defaults/.gemini \
             /opt/defaults/.config/opencode /opt/defaults/.config/mise /opt/defaults/.config/boss \
 && cp -a /home/boss/.bashrc /opt/defaults/.bashrc \
 && cp -a /home/boss/.tmux.conf /opt/defaults/.tmux.conf \
 && cp -a /home/boss/.claude.json /opt/defaults/.claude.json \
 && cp -a /home/boss/.claude/settings.json /opt/defaults/.claude/settings.json \
 && cp -a /home/boss/.codex/config.toml /opt/defaults/.codex/config.toml \
 && cp -a /home/boss/.gemini/settings.json /opt/defaults/.gemini/settings.json \
 && cp -a /home/boss/.config/opencode/opencode.json /opt/defaults/.config/opencode/opencode.json \
 && cp -a /home/boss/.config/mise/config.toml /opt/defaults/.config/mise/config.toml \
 && printf 'seed-defaults-v1\n' > /opt/defaults/.config/boss/default-seed.marker

# ---------- mise tool installation (boss phase) ----------
# Allow boss to update lockfile during install (rootfs is read-only at runtime)
# Re-chown home tree: root-phase steps (mise lock, COPY, etc.) may have
# created XDG dirs (~/.local, ~/.cache, ~/.config) owned by root.
RUN chown boss:boss /etc/mise /etc/mise/mise.lock \
 && chown -R boss:boss /home/boss

USER boss
WORKDIR /home/boss
RUN mise trust /etc/mise/config.toml \
 && mise install --locked \
 && mise reshim

# ---------- verify agent binaries ----------
RUN claude --version \
 && codex --help > /dev/null \
 && gemini --version \
 && opencode --version \
 && gpg --version > /dev/null \
 && tree --version > /dev/null \
 && gh --version > /dev/null \
 && glab --version > /dev/null

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/boss-entrypoint.sh"]
CMD ["bash"]
