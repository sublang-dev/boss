#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_DIR="${SCRIPT_DIR}/../image"
IMAGE_NAME="iteron-sandbox"
TAG="dev"
MULTI_ARCH=false
PUSH=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Build the IterOn sandbox OCI image.

Options:
  --tag TAG         Image tag (default: dev)
  --multi-arch      Build for linux/amd64 and linux/arm64 (requires --push)
  --push            Push to registry after build
  -h, --help        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)        TAG="$2"; shift 2 ;;
    --multi-arch) MULTI_ARCH=true; shift ;;
    --push)       PUSH=true; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

# Detect a *functional* container runtime (not just present on PATH)
detect_runtime() {
  if command -v podman &>/dev/null && podman info &>/dev/null; then
    echo podman
  elif command -v docker &>/dev/null && docker info &>/dev/null; then
    echo docker
  else
    return 1
  fi
}

RUNTIME="$(detect_runtime)" || {
  echo "Error: no functional container runtime found (tried podman, docker)" >&2
  exit 1
}

FULL_TAG="${IMAGE_NAME}:${TAG}"
echo "Runtime: ${RUNTIME}"
echo "Image:   ${FULL_TAG}"

# Optional: forward GITHUB_TOKEN as a build secret to avoid API rate limits
# during mise lock (github backend resolves releases via GitHub API).
# Accept GH_TOKEN (gh CLI default) as fallback.
GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
SECRET_ARGS=()
if [[ -n "${GITHUB_TOKEN}" ]]; then
  if [[ "${RUNTIME}" == podman ]]; then
    SECRET_ARGS+=(--secret "id=GITHUB_TOKEN,env=GITHUB_TOKEN")
  else
    SECRET_ARGS+=(--secret "id=GITHUB_TOKEN")
  fi
fi

if [[ "${MULTI_ARCH}" == true ]]; then
  if [[ "${PUSH}" != true ]]; then
    echo "Error: --multi-arch requires --push (multi-platform builds cannot be loaded locally)" >&2
    exit 1
  fi
  echo "Platform: linux/amd64,linux/arm64"
  if [[ "${RUNTIME}" == podman ]]; then
    # Podman: build per-arch, then create and push a manifest list
    podman build "${SECRET_ARGS[@]}" --platform linux/amd64 -t "${FULL_TAG}-amd64" "${IMAGE_DIR}"
    podman build "${SECRET_ARGS[@]}" --platform linux/arm64 -t "${FULL_TAG}-arm64" "${IMAGE_DIR}"
    podman manifest create "${FULL_TAG}" \
      "${FULL_TAG}-amd64" "${FULL_TAG}-arm64"
    podman manifest push "${FULL_TAG}" "docker://${FULL_TAG}"
  else
    # Docker: requires buildx with docker-container driver
    BUILDER="iteron-multiarch"
    if ! docker buildx inspect "${BUILDER}" &>/dev/null; then
      docker buildx create --name "${BUILDER}" --driver docker-container --use
    else
      docker buildx use "${BUILDER}"
    fi
    docker buildx build \
      "${SECRET_ARGS[@]}" \
      --platform linux/amd64,linux/arm64 \
      -t "${FULL_TAG}" \
      --push \
      "${IMAGE_DIR}"
  fi
else
  echo "Platform: native"
  ${RUNTIME} build "${SECRET_ARGS[@]}" -t "${FULL_TAG}" "${IMAGE_DIR}"
  if [[ "${PUSH}" == true ]]; then
    ${RUNTIME} push "${FULL_TAG}"
  fi
fi

echo "Done: ${FULL_TAG}"
