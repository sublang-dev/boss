#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

set -eu

HOME="${HOME:-/home/boss}"

if [ -d /opt/defaults ]; then
  find /opt/defaults -mindepth 1 -type f -exec sh -eu -c '
    home="$1"; shift
    for src; do
      rel="${src#/opt/defaults/}"
      dst="${home}/${rel}"
      [ -e "$dst" ] && continue
      mkdir -p "$(dirname "$dst")"
      cp -a "$src" "$dst" 2>/dev/null || cp "$src" "$dst"
    done
  ' sh "$HOME" {} +
fi

if [ -n "${BOSS_IMAGE_VERSION:-}" ]; then
  state_home="${XDG_STATE_HOME:-${HOME}/.local/state}"
  marker="${state_home}/.boss-image-version"
  prev=""

  mkdir -p "$state_home"
  if [ -f "$marker" ]; then
    prev="$(cat "$marker" || true)"
  fi

  if [ "$prev" != "$BOSS_IMAGE_VERSION" ]; then
    if [ -n "$prev" ]; then
      echo "boss-image-version changed: ${prev} -> ${BOSS_IMAGE_VERSION}" >&2
    else
      echo "boss-image-version changed: <none> -> ${BOSS_IMAGE_VERSION}" >&2
    fi
  fi

  printf '%s\n' "$BOSS_IMAGE_VERSION" > "$marker"
fi

exec "$@"
