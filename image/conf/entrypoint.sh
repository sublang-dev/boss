#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

set -eu

HOME="${HOME:-/home/boss}"
state_home="${XDG_STATE_HOME:-${HOME}/.local/state}"
mise_state="${state_home}/.boss-mise-reconcile.state"
mise_in_progress="${state_home}/.boss-mise-reconcile.in-progress"

prev_status=""
prev_fingerprint=""
prev_failed_step=""
prev_error_class=""

sys_cfg_hash=""
sys_lock_hash=""
user_cfg_hash=""
user_lock_hash=""
fingerprint=""

mkdir -p "$state_home"
: > "$mise_in_progress"
# dash does not run EXIT traps after `exec "$@"`; explicit rm calls in
# run_mise_reconciliation remain the primary cleanup path.
trap 'rm -f "$mise_in_progress"' EXIT INT TERM HUP

hash_file() {
  file="$1"
  if [ ! -f "$file" ]; then
    printf 'missing'
    return 0
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
    return 0
  fi
  cksum "$file" | awk '{print $1}'
}

hash_text() {
  text="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$text" | sha256sum | awk '{print $1}'
    return 0
  fi
  printf '%s' "$text" | cksum | awk '{print $1}'
}

last_non_empty_line() {
  raw="$1"
  line="$(printf '%s\n' "$raw" | tr '\r' '\n' | awk 'NF { last=$0 } END { print last }')"
  if [ -z "$line" ]; then
    line="$raw"
  fi
  printf '%s' "$line" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//'
}

classify_error() {
  msg_lc="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$msg_lc" in
    *"could not resolve"*|*"timed out"*|*"timeout"*|*"temporary failure"*|*"connection refused"*|*"connection reset"*|*"tls"*|*"ssl"*|*"http 429"*|*"http 5"*|*"network"*)
      printf 'network'
      ;;
    *"unauthorized"*|*"forbidden"*|*"authentication"*|*"auth"*)
      printf 'auth'
      ;;
    *"lock"*|*"locked"*)
      printf 'lockfile'
      ;;
    *"trust"*|*"untrusted"*)
      printf 'trust'
      ;;
    *)
      printf 'unknown'
      ;;
  esac
}

read_previous_mise_state() {
  prev_status=""
  prev_fingerprint=""
  prev_failed_step=""
  prev_error_class=""
  [ -f "$mise_state" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      *=*)
        key="${line%%=*}"
        value="${line#*=}"
        case "$key" in
          status) prev_status="$value" ;;
          fingerprint) prev_fingerprint="$value" ;;
          failed_step) prev_failed_step="$value" ;;
          error_class) prev_error_class="$value" ;;
        esac
        ;;
    esac
  done < "$mise_state"
}

compute_mise_fingerprint() {
  sys_cfg_hash="$(hash_file /etc/mise/config.toml)"
  sys_lock_hash="$(hash_file /etc/mise/mise.lock)"
  user_cfg_hash="$(hash_file "$HOME/.config/mise/config.toml")"
  user_lock_hash="$(hash_file "$HOME/.config/mise/mise.lock")"
  image_version="${BOSS_IMAGE_VERSION:-unknown}"
  material="image=${image_version};system_config=${sys_cfg_hash};system_lock=${sys_lock_hash};user_config=${user_cfg_hash};user_lock=${user_lock_hash}"
  fingerprint="$(hash_text "$material")"
}

write_mise_state() {
  status="$1"
  failed_step="$2"
  error_class="$3"
  error_message="$4"
  should_warn="$5"
  now_epoch="$(date +%s 2>/dev/null || printf '0')"

  mkdir -p "$state_home"
  {
    printf 'version=1\n'
    printf 'status=%s\n' "$status"
    printf 'fingerprint=%s\n' "$fingerprint"
    printf 'image_version=%s\n' "${BOSS_IMAGE_VERSION:-unknown}"
    printf 'system_config_hash=%s\n' "$sys_cfg_hash"
    printf 'system_lock_hash=%s\n' "$sys_lock_hash"
    printf 'user_config_hash=%s\n' "$user_cfg_hash"
    printf 'user_lock_hash=%s\n' "$user_lock_hash"
    printf 'failed_step=%s\n' "$failed_step"
    printf 'error_class=%s\n' "$error_class"
    printf 'error_message=%s\n' "$error_message"
    printf 'should_warn=%s\n' "$should_warn"
    printf 'updated_at_epoch=%s\n' "$now_epoch"
  } > "$mise_state"
}

record_mise_failure() {
  failed_step="$1"
  raw_output="$2"
  error_message="$(last_non_empty_line "$raw_output")"
  error_class="$(classify_error "$error_message")"

  should_warn="1"
  if [ "$prev_status" = "error" ] \
    && [ "$prev_fingerprint" = "$fingerprint" ] \
    && [ "$prev_failed_step" = "$failed_step" ] \
    && [ "$prev_error_class" = "$error_class" ]; then
    should_warn="0"
  fi

  write_mise_state "error" "$failed_step" "$error_class" "$error_message" "$should_warn"
  if [ "$should_warn" = "1" ]; then
    echo "Warning: mise reconciliation failed (${failed_step}/${error_class}): ${error_message}" >&2
  fi
}

record_mise_hint() {
  hint_step="$1"
  hint_class="$2"
  hint_message="$3"

  should_warn="1"
  if [ "$prev_status" = "ok" ] \
    && [ "$prev_fingerprint" = "$fingerprint" ] \
    && [ "$prev_failed_step" = "$hint_step" ] \
    && [ "$prev_error_class" = "$hint_class" ]; then
    should_warn="0"
  fi

  write_mise_state "ok" "$hint_step" "$hint_class" "$hint_message" "$should_warn"
  if [ "$should_warn" = "1" ]; then
    echo "Warning: mise reconciliation hint (${hint_step}/${hint_class}): ${hint_message}" >&2
  fi
}

mise_debug_enabled=0
case "${BOSS_DEBUG:-}" in
  1|true|TRUE|yes|YES|on|ON) mise_debug_enabled=1 ;;
esac
case "${MISE_DEBUG:-}" in
  1|true|TRUE|yes|YES|on|ON) mise_debug_enabled=1 ;;
esac

run_mise() {
  if [ "$mise_debug_enabled" = "1" ] && [ -z "${MISE_VERBOSE:-}" ]; then
    MISE_VERBOSE=1 mise "$@"
    return $?
  fi
  mise "$@"
}

user_config_declares_tools() {
  cfg="$HOME/.config/mise/config.toml"
  [ -f "$cfg" ] || return 1

  awk '
    BEGIN { in_tools=0; found=0 }
    /^[[:space:]]*\[/ {
      in_tools = ($0 ~ /^[[:space:]]*\[tools\][[:space:]]*$/)
      next
    }
    in_tools {
      line = $0
      sub(/[[:space:]]*#.*$/, "", line)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line ~ /=/) { found=1; exit 0 }
    }
    END { exit(found ? 0 : 1) }
  ' "$cfg"
}

run_mise_reconciliation() {
  if [ ! -f "$HOME/.config/mise/config.toml" ]; then
    mkdir -p "$HOME/.config/mise"
    : > "$HOME/.config/mise/config.toml"
  fi

  compute_mise_fingerprint
  read_previous_mise_state

  if ! command -v mise >/dev/null 2>&1; then
    write_mise_state "skipped" "" "" "mise-not-found" "0"
    rm -f "$mise_in_progress"
    return 0
  fi

  if trust_system_output="$(run_mise trust /etc/mise/config.toml 2>&1)"; then
    :
  else
    record_mise_failure "trust_system" "$trust_system_output"
    rm -f "$mise_in_progress"
    return 0
  fi

  if trust_user_output="$(run_mise trust "$HOME/.config/mise/config.toml" 2>&1)"; then
    :
  else
    record_mise_failure "trust_user" "$trust_user_output"
    rm -f "$mise_in_progress"
    return 0
  fi

  if sys_tmp="$(mktemp -d /tmp/boss-mise-system.XXXXXX 2>/dev/null)"; then
    :
  else
    sys_tmp="/tmp/boss-mise-system-$$"
    rm -rf "$sys_tmp" 2>/dev/null || true
    mkdir -p "$sys_tmp"
  fi

  if prepare_system_output="$(
    cp /etc/mise/config.toml "$sys_tmp/mise.toml" 2>&1
    cp /etc/mise/mise.lock "$sys_tmp/mise.lock" 2>&1
  )"; then
    :
  else
    record_mise_failure "prepare_system_locked" "$prepare_system_output"
    rm -rf "$sys_tmp" 2>/dev/null || true
    rm -f "$mise_in_progress"
    return 0
  fi

  if trust_system_tmp_output="$(run_mise trust "$sys_tmp/mise.toml" 2>&1)"; then
    :
  else
    record_mise_failure "trust_system_locked" "$trust_system_tmp_output"
    rm -rf "$sys_tmp" 2>/dev/null || true
    rm -f "$mise_in_progress"
    return 0
  fi

  system_ignore_paths="/etc/mise/config.toml:$HOME/.config/mise/config.toml"
  if install_system_output="$(MISE_IGNORED_CONFIG_PATHS="$system_ignore_paths" run_mise -C "$sys_tmp" install --locked 2>&1)"; then
    :
  else
    record_mise_failure "install_system_locked" "$install_system_output"
    rm -rf "$sys_tmp" 2>/dev/null || true
    rm -f "$mise_in_progress"
    return 0
  fi

  rm -rf "$sys_tmp" 2>/dev/null || true

  # --- on-demand agent reconciliation ---
  # On-demand agents are activated via symlinks in ~/.local/bin/ (created by
  # `boss open`).  Check for those symlinks — NOT `mise which`, which would
  # require the tool to be declared in a mise config.  This block must run
  # BEFORE the user-phase so that the user_config_declares_tools early-return
  # cannot shadow it.
  ondemand_cfg="/etc/mise/ondemand.toml"
  ondemand_lock="/etc/mise/ondemand.lock"
  if [ -f "$ondemand_cfg" ] && [ -f "$ondemand_lock" ]; then
    # Collect on-demand tools that were previously activated
    od_activated=""
    for tool_bin in gemini opencode; do
      if [ -L "$HOME/.local/bin/$tool_bin" ]; then
        od_activated="${od_activated} ${tool_bin}"
      fi
    done

    if [ -n "$od_activated" ]; then
      if od_tmp="$(mktemp -d /tmp/boss-mise-ondemand.XXXXXX 2>/dev/null)"; then
        :
      else
        od_tmp="/tmp/boss-mise-ondemand-$$"
        rm -rf "$od_tmp" 2>/dev/null || true
        mkdir -p "$od_tmp"
      fi

      if od_prepare_output="$(
        cp "$ondemand_cfg" "$od_tmp/mise.toml" 2>&1
        cp "$ondemand_lock" "$od_tmp/mise.lock" 2>&1
      )"; then
        :
      else
        record_mise_failure "prepare_ondemand_locked" "$od_prepare_output"
        rm -rf "$od_tmp" 2>/dev/null || true
        rm -f "$mise_in_progress"
        return 0
      fi

      if od_trust_output="$(run_mise trust "$od_tmp/mise.toml" 2>&1)"; then
        :
      else
        record_mise_failure "trust_ondemand_locked" "$od_trust_output"
        rm -rf "$od_tmp" 2>/dev/null || true
        rm -f "$mise_in_progress"
        return 0
      fi

      ondemand_ignore="/etc/mise/config.toml:$HOME/.config/mise/config.toml"
      if od_install_output="$(MISE_IGNORED_CONFIG_PATHS="$ondemand_ignore" run_mise -C "$od_tmp" install --locked 2>&1)"; then
        # Update symlinks to point to the (possibly upgraded) binary paths.
        for tool_bin in $od_activated; do
          real_path="$(MISE_IGNORED_CONFIG_PATHS="$ondemand_ignore" run_mise -C "$od_tmp" which "$tool_bin" 2>/dev/null || true)"
          if [ -n "$real_path" ] && [ -x "$real_path" ]; then
            ln -sf "$real_path" "$HOME/.local/bin/$tool_bin"
          fi
        done
        # Clean up OpenCode musl binaries if opencode was reconciled
        if [ -L "$HOME/.local/bin/opencode" ]; then
          find ~/.local/share/mise/installs -type d -name 'opencode-linux-*-musl' -exec rm -rf {} + 2>/dev/null || true
        fi
      else
        record_mise_failure "install_ondemand_locked" "$od_install_output"
        rm -rf "$od_tmp" 2>/dev/null || true
        rm -f "$mise_in_progress"
        return 0
      fi

      rm -rf "$od_tmp" 2>/dev/null || true
    fi

    # Remove stale mise shims for on-demand tools left over from an older
    # image that baked them in.  Only delete if no mise config claims the
    # tool (i.e. user hasn't explicitly adopted it via mise use -g).
    for tool_bin in gemini opencode; do
      stale_shim="$HOME/.local/share/mise/shims/$tool_bin"
      if [ -f "$stale_shim" ] && ! mise which "$tool_bin" >/dev/null 2>&1; then
        rm -f "$stale_shim"
      fi
    done
  fi

  if [ -f "$HOME/.config/mise/mise.lock" ]; then
    if install_user_output="$(MISE_IGNORED_CONFIG_PATHS="/etc/mise/config.toml" run_mise install --locked 2>&1)"; then
      :
    else
      record_mise_failure "install_user_locked" "$install_user_output"
      rm -f "$mise_in_progress"
      return 0
    fi
  elif user_config_declares_tools; then
    user_lock_hint="user tools declared without ~/.config/mise/mise.lock; run 'mise lock' to enable startup reconciliation"
    record_mise_hint "user_lock_missing" "lockfile" "$user_lock_hint"
    rm -f "$mise_in_progress"
    return 0
  fi

  write_mise_state "ok" "" "" "" "0"
  rm -f "$mise_in_progress"
}

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

run_mise_reconciliation

if [ -n "${BOSS_IMAGE_VERSION:-}" ]; then
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
