<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-003: Tests and CI

## Goal

Add automated unit and integration tests for the CLI utilities and container lifecycle commands (IR-002), and extend CI to run them on every push and pull request. Prevent regressions before IR-004 adds more commands.

## Deliverables

- [x] Vitest test framework configured with coverage
- [x] Unit tests for `platform`, `config`, `podman`, and `git` utilities
- [x] Integration tests for `init`, `start`, `stop` with real Podman
- [x] CI: unit tests on Node 20/22, integration tests on Ubuntu with Podman
- [x] CI: integration tests against prebuilt sandbox image on Ubuntu
- [x] `BOSS_CONFIG_DIR` env var override for test isolation
- [x] `BOSS_TEST_IMAGE` env var override for CI against real sandbox image

## Tasks

### 1. Production code change

Make `CONFIG_DIR` respect `BOSS_CONFIG_DIR` env var so tests can use isolated temp directories without polluting `~/.boss`:

```typescript
export const CONFIG_DIR = process.env.BOSS_CONFIG_DIR ?? join(homedir(), '.boss');
```

### 2. Test framework setup

- Install `vitest` and `@vitest/coverage-v8` as dev dependencies
- Create `vitest.config.ts` with:
  - Include `tests/**/*.test.ts`
  - Coverage provider: v8, include `src/**/*.ts`
- Add scripts to `package.json`:
  - `test` — run unit tests
  - `test:integration` — run integration tests
  - `test:all` — run all tests
  - `test:watch` — watch mode for unit tests
  - `test:coverage` — unit tests with coverage

### 3. Unit tests

**`tests/unit/platform.test.ts`**:

- `needsMachine()`: true for macOS, false for linux/wsl
- `podmanInstallCommand()`: correct arrays for all 8 install methods
- `detectPlatform()`: mock `process.platform`/`process.arch`/`readFileSync` for macOS, linux, wsl, unsupported
- `detectInstallMethod()`: mock `execFileSync` (the `which` calls)

**`tests/unit/config.test.ts`** (uses temp dir via `BOSS_CONFIG_DIR`):

- `defaultConfig()` returns correct structure with/without custom image
- `writeConfig()` → `readConfig()` round-trip
- `writeConfig()` idempotent (returns false second time)
- `reconcileConfigImage()` updates legacy default image, preserves custom image by default, and updates custom image when forced
- `readConfig()` throws when config missing
- `writeEnvTemplate()` creates file with expected keys, idempotent

**`tests/unit/podman.test.ts`**:

- `podmanErrorMessage()`: ENOENT, stderr extraction, fallback
- Mock `execFile` for: `isPodmanInstalled`, `imageExists`, `containerExists`, `isContainerRunning`, `volumeExists`
- Assert `containerExists`/`isContainerRunning` call container-scoped inspect args (`podman container inspect ...`)

**`tests/unit/git.test.ts`** (uses temp dir):

- `findGitRoot()` from within repo finds root
- `findGitRoot()` from temp dir without `.git` returns null

### 4. Integration tests (real Podman required)

**`tests/integration/init.test.ts`**:

- Init with `--yes` and `--image alpine:latest` in isolated config dir
- Second init skips all steps (idempotent) — IR-002 test 3
- Existing legacy config image (`docker.io/library/alpine:latest`) is reconciled to the default sandbox image
- Config and env files have expected content — IR-002 tests 10, 11

**`tests/integration/start-stop.test.ts`**:

- Start: container is running
- Security: cap-drop ALL, read-only rootfs, no-new-privileges — IR-002 tests 4–6
- Start idempotent: "already running" — IR-002 test 7
- Stop: container gone — IR-002 test 8
- Stop idempotent: "not running" — IR-002 test 9
- Env propagation — IR-002 test 12
- Volume persistence across restart — IR-002 test 13

Integration tests respect `BOSS_TEST_IMAGE` env var (defaults to `alpine:latest` for fast local runs). Use 120s timeout and run sequentially via `--fileParallelism=false` (shared Podman state). Robust `afterAll` cleanup.

### 5. CI updates

Extend `.github/workflows/ci.yml` with four jobs:

- **build**: existing — `npm run build` on Node [18, 20, 22]
- **test-unit**: parallel with build — `npm test` on Node [20, 22] (Vitest 4 requires Node >=20)
- **test-integration**: after build — `npm run test:integration` on Ubuntu, Node 22 only, `alpine:latest` (fast smoke test, Podman pre-installed)
- **test-integration-image**: after build — `npm run test:integration` on Ubuntu, Node 22, with `BOSS_TEST_IMAGE=ghcr.io/sublang-dev/boss-sandbox:dev-latest` (validates CLI against real sandbox image; macOS omitted because GitHub Actions runners lack nested virtualization for Podman machine)

## Verification

| # | Test | Expected |
| --- | --- | --- |
| 1 | `npm test` | All unit tests pass |
| 2 | `npm run test:integration` | All integration tests pass (requires Podman) |
| 3 | `npm run build` | Compiles cleanly |
| 4 | `npm run test:coverage` | Coverage report generated |
| 5 | Push to branch and check CI | build, test-unit, test-integration, test-integration-image jobs pass |

## Dependencies

- [IR-002](002-container-lifecycle.md) (commands must be implemented)
- [IR-001](001-oci-sandbox-image.md) (sandbox image published to GHCR for image integration tests)
- Podman installed locally for integration tests
