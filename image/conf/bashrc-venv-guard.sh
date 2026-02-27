# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

_pip_user_venv_guard() {
    if [ -n "${VIRTUAL_ENV:-}" ]; then
        unset PIP_USER
        # Shell-local sentinel; intentionally not exported.
        _BOSS_VENV_WAS_ACTIVE=1
    elif [ -n "${_BOSS_VENV_WAS_ACTIVE:-}" ]; then
        export PIP_USER=1
        unset _BOSS_VENV_WAS_ACTIVE
    fi
    # Outside a venv and not transitioning: leave PIP_USER untouched
    # to preserve any explicit user override (e.g. `unset PIP_USER`).
}
case "${PROMPT_COMMAND:-}" in
    *_pip_user_venv_guard*) ;;
    *) PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND; }_pip_user_venv_guard" ;;
esac
