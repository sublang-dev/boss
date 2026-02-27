#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

set -eu

deny_user_msg='sudo: user switching not supported in rootless mode'
deny_group_msg='sudo: group switching not supported in rootless mode'
deny_shell_msg='sudo: interactive shells not supported in rootless mode'

while [ "$#" -gt 0 ]; do
  case "$1" in
    --)
      shift
      break
      ;;
    -u|--user|--user=*)
      echo "$deny_user_msg" >&2
      exit 1
      ;;
    -g|--group|--group=*)
      echo "$deny_group_msg" >&2
      exit 1
      ;;
    -i|-s)
      echo "$deny_shell_msg" >&2
      exit 1
      ;;
    -E|-n|-S|-k|-K|-v|--preserve-env|--preserve-env=*)
      shift
      ;;
    -*)
      echo "sudo: unsupported option: $1" >&2
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if [ "$#" -eq 0 ]; then
  echo "sudo: a command is required" >&2
  exit 1
fi

echo "# rootless: sudo is a no-op shim; running as boss" >&2
exec "$@"
