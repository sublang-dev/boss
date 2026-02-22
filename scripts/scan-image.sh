#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

# Run Trivy vulnerability scan on the boss-sandbox image.
# Usage: scripts/scan-image.sh [IMAGE_TAG]
# Exits non-zero if CRITICAL or HIGH CVEs are found (excluding accepted CVEs
# listed in image/.trivyignore).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
IGNOREFILE="${REPO_ROOT}/image/.trivyignore"
IMAGE="${1:-boss-sandbox:latest}"

if ! command -v trivy &>/dev/null; then
  echo "Error: trivy is not installed. See https://aquasecurity.github.io/trivy/" >&2
  exit 1
fi

echo "Scanning ${IMAGE} for CRITICAL/HIGH vulnerabilities..."
trivy image --severity CRITICAL,HIGH --exit-code 1 --ignorefile "$IGNOREFILE" "$IMAGE"
