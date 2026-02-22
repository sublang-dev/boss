#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

# Creates the IR-006 test fixture (buggy Node.js project) inside a container.
# Usage: setup-fixture.sh <container> <workspace>
#   container  — Podman container name (e.g. boss-test-sandbox)
#   workspace  — Target directory name under /home/boss (e.g. test-cc)

set -euo pipefail

CONTAINER="${1:?Usage: setup-fixture.sh <container> <workspace>}"
WORKSPACE="${2:?Usage: setup-fixture.sh <container> <workspace>}"

DIR="/home/boss/${WORKSPACE}"

# Clean any previous fixture
podman exec "$CONTAINER" rm -rf "$DIR"

# Create directory structure
podman exec "$CONTAINER" mkdir -p "${DIR}/src" "${DIR}/tests"

# Initialize git repo (Codex CLI requires a trusted git directory)
podman exec "$CONTAINER" git -C "$DIR" init -q

# package.json
podman exec "$CONTAINER" bash -c "cat > ${DIR}/package.json << 'FIXTURE_EOF'
{ \"scripts\": { \"test\": \"node tests/test_calc.js\" } }
FIXTURE_EOF"

# src/calc.js — intentional bug: returns a - b instead of a + b
podman exec "$CONTAINER" bash -c "cat > ${DIR}/src/calc.js << 'FIXTURE_EOF'
function add(a, b) { return a - b; }
module.exports = { add };
FIXTURE_EOF"

# tests/test_calc.js
podman exec "$CONTAINER" bash -c "cat > ${DIR}/tests/test_calc.js << 'FIXTURE_EOF'
const assert = require('assert');
const { add } = require('../src/calc');
assert.strictEqual(add(2, 3), 5);
console.log('PASS');
FIXTURE_EOF"
