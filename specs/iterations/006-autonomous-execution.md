<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai> -->

# IR-006: Autonomous Execution Validation

## Goal

Verify that each agent can complete a real coding task autonomously — no permission prompts, no human intervention after the initial prompt — using a fixed test fixture with deterministic expected output.

## Deliverables

- [ ] Test fixture script that creates a reproducible project inside the container
- [ ] Per-agent test scripts that run the agent, wait for completion, and check artifacts
- [ ] All four agents pass the coding task without human interaction

## Tasks

### 1. Test fixture

Create a minimal Node.js project inside the container (Node.js is available from the base image):

```
~/test-fixture/
  package.json
  src/calc.js
  tests/test_calc.js
```

**`package.json`**:
```json
{ "scripts": { "test": "node tests/test_calc.js" } }
```

**`src/calc.js`** (contains intentional bug):
```javascript
function add(a, b) { return a - b; }
module.exports = { add };
```

**`tests/test_calc.js`**:
```javascript
const assert = require('assert');
const { add } = require('../src/calc');
assert.strictEqual(add(2, 3), 5);
console.log('PASS');
```

A setup script (`tests/setup-fixture.sh`) creates this fixture via `podman exec` before each agent test. The fixture is deleted and recreated between agents to ensure isolation.

### 2. Claude Code autonomous test

- Create fixture at `~/test-cc/`
- Run: `podman exec iteron-sandbox bash -c 'cd ~/test-cc && claude -p "Fix the bug in src/calc.js so that npm test passes. Do not modify tests/test_calc.js." --output-format json'`
- Wait for exit (timeout: 120s)
- Check: `podman exec iteron-sandbox bash -c 'cd ~/test-cc && npm test'`
- Expected: exit 0, stdout contains `PASS`

### 3. Codex CLI autonomous test

- Create fixture at `~/test-codex/`
- Run: `podman exec iteron-sandbox bash -c 'cd ~/test-codex && codex exec "Fix the bug in src/calc.js so that npm test passes. Do not modify tests/test_calc.js."'`
- Wait for exit (timeout: 120s)
- Check: `podman exec iteron-sandbox bash -c 'cd ~/test-codex && npm test'`
- Expected: exit 0, stdout contains `PASS`

### 4. Gemini CLI autonomous test

- Create fixture at `~/test-gemini/`
- Run: `podman exec iteron-sandbox bash -c 'cd ~/test-gemini && gemini -p "Fix the bug in src/calc.js so that npm test passes. Do not modify tests/test_calc.js."'`
- Wait for exit (timeout: 120s)
- Check: `podman exec iteron-sandbox bash -c 'cd ~/test-gemini && npm test'`
- Expected: exit 0, stdout contains `PASS`
- Note: Gemini CLI non-interactive invocation syntax should be verified against current docs

### 5. OpenCode autonomous test

- Create fixture at `~/test-opencode/`
- Run: `podman exec iteron-sandbox bash -c 'cd ~/test-opencode && opencode -p "Fix the bug in src/calc.js so that npm test passes. Do not modify tests/test_calc.js."'`
- Wait for exit (timeout: 120s)
- Check: `podman exec iteron-sandbox bash -c 'cd ~/test-opencode && npm test'`
- Expected: exit 0, stdout contains `PASS`
- Note: OpenCode non-interactive invocation syntax should be verified against current docs

### 6. Permission prompt absence test

For each agent test above, additionally verify that the agent did not pause for permission approval:

- Capture agent stdout/stderr to a log file during execution
- Grep log for known permission prompt patterns (e.g., `[Y/n]`, `Allow`, `approve`, `permission`)
- Expected: no matches (agent ran without pausing for approval)

## Verification

| # | Test | Input | Expected output |
| --- | --- | --- | --- |
| 1 | Setup fixture, `npm test` before fix | `~/test-cc/` with buggy `calc.js` | Exit 1; `AssertionError` |
| 2 | Claude Code autonomous fix | `claude -p "Fix the bug..."` in `~/test-cc/` | Agent exits 0; `npm test` exits 0; stdout contains `PASS` |
| 3 | Claude Code log grep | Agent log from test 2 | No permission prompt patterns found |
| 4 | Codex CLI autonomous fix | `codex exec "Fix the bug..."` in `~/test-codex/` | Agent exits 0; `npm test` exits 0; stdout contains `PASS` |
| 5 | Codex CLI log grep | Agent log from test 4 | No permission prompt patterns found |
| 6 | Gemini CLI autonomous fix | `gemini -p "Fix the bug..."` in `~/test-gemini/` | Agent exits 0; `npm test` exits 0; stdout contains `PASS` |
| 7 | Gemini CLI log grep | Agent log from test 6 | No permission prompt patterns found |
| 8 | OpenCode autonomous fix | `opencode -p "Fix the bug..."` in `~/test-opencode/` | Agent exits 0; `npm test` exits 0; stdout contains `PASS` |
| 9 | OpenCode log grep | Agent log from test 8 | No permission prompt patterns found |
| 10 | All four agents sequentially | Run tests 2, 4, 6, 8 in sequence | All four pass |

## Dependencies

- [IR-005](005-headless-auth.md) (agents must authenticate headlessly)
- Valid API keys for all four agent providers
