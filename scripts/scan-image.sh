#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

# Run Trivy vulnerability scan on the iteron-sandbox image.
# Usage: scripts/scan-image.sh [IMAGE_TAG]
# Exits non-zero if CRITICAL or HIGH CVEs are found.

set -euo pipefail

IMAGE="${1:-iteron-sandbox:latest}"

if ! command -v trivy &>/dev/null; then
  echo "Error: trivy is not installed. See https://aquasecurity.github.io/trivy/" >&2
  exit 1
fi

echo "Scanning ${IMAGE} for CRITICAL/HIGH vulnerabilities..."
trivy image --severity CRITICAL,HIGH --exit-code 1 "$IMAGE"
