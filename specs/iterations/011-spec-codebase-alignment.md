<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-011: Spec–Codebase Alignment

## Goal

Close gaps between specs, implementation, and documentation surfaced
by cross-cutting audit of `specs/items/`, CLI source, and `docs/`.

## Deliverables

- [x] LCD package has a `user/lifecycle.md` covering `init`, `start`,
      and `stop` user-visible behavior
- [x] `docs/cli-reference.md` exit-code tables match specs and code
- [x] `docs/install.md` reflects current version and `init` behavior
- [x] `boss rm` abort exit-code behavior is canonicalized
- [x] LCD-55 non-rootless failure path has an integration test
- [x] SAND-8 / SAND-64 (image-size gate) removal is clean
- [ ] `boss scaffold` has a spec package
- [ ] DR-002 acknowledges `scaffold` as the seventh command
- [ ] LCD-6 moved to SAND to resolve META-13 package-boundary violation

## Tasks

1. **Create `items/user/lifecycle.md` (LCD package)**
   - Extract user-visible behavior from `items/dev/lifecycle.md`:
     what `boss init` creates, what `boss start` outputs, what
     `boss stop` does, prompts, success/failure messages
   - Keep `items/dev/lifecycle.md` focused on implementation details
     (rootless enforcement, capability drops, env injection, SSH
     plumbing, mise reconciliation)
   - Add the new file to `map.md` under LCD
   - Follow the WS package as a model: `user/workspace.md` (behavior)
     vs `dev/workspace.md` (implementation)

2. **Fix `docs/cli-reference.md` exit codes**
   - `boss ls`: change exit-code table from "0 Always" to reflect
     non-zero on container-not-running, per
     [WS-12](../items/user/workspace.md#ws-12) and `ls.ts`
   - `boss rm`: reconcile "1 on user abort" with the code
     (`rm.ts` returns 0); see task 4

3. **Update `docs/install.md`**
   - Version example: `0.1.2` → current `package.json` version
   - Operation order: match `init.ts` (config/env first, then
     pull/volume), not the stale pull-first narrative
   - Verify expected output blocks match current CLI output,
     per [DOC-2](../items/dev/docs.md#doc-2)

4. **Canonicalize `boss rm` abort behavior**
   - Decide: should abort exit 0 (current code) or 1 (current docs)?
   - Update whichever is wrong (code or docs) and add the abort
     exit-code to [WS-11](../items/user/workspace.md#ws-11) so the
     spec is authoritative

5. **Add LCD-55 integration test**
   - The spec item exists (`test/lifecycle.md`); the code path exists
     (`init.ts:109-115`); only the test is missing
   - Add a test to `tests/integration/init.test.ts` that mocks or
     triggers a non-rootless runtime and asserts non-zero exit

6. **Verify SAND-8 / SAND-64 removal is complete**
   - SAND-8 and SAND-64 were removed from `dev/sandbox-image.md` and
     `test/sandbox-image.md` in this iteration's prep commit
   - IR-009 risk table updated to drop SAND-8 reference
   - `map.md` summaries updated
   - Confirm no dangling cross-references remain

7. **Create spec package for `boss scaffold`**
   - Choose package short form (suggested: SCAF)
   - Create `items/user/scaffold.md`: target directory resolution
     (explicit path, git root, cwd), idempotency behavior, what
     gets created (`specs/` tree, `CLAUDE.md`/`AGENTS.md` append),
     success/error messages
   - Create `items/dev/scaffold.md`: template copy mechanics
     (`scaffold/` → target), `getScaffoldDir()` resolution,
     `appendAgentSpecs()` logic, file-existence guards
   - Add both files to `map.md` under a new SCAF package section
   - Optionally add `items/test/scaffold.md` with verification items

8. **Update DR-002 to acknowledge `scaffold`**
   - DR-002 currently describes a 6-command CLI
     (`init`/`start`/`stop`/`open`/`ls`/`rm`); `scaffold` was
     added later without updating the DR
   - Add a section or amend the command set to include `scaffold`
     as the seventh command, noting it is a project-setup utility
     distinct from the sandbox-lifecycle commands

9. **Move LCD-6 to SAND (META-13 fix)**
   - LCD-6's shall clause uses the subject "The sandbox image," which
     is a SAND subject; [META-13](../meta.md#meta-13) requires shall
     clauses to stay within the package's closed intent
   - Move the SSH known-hosts / `StrictHostKeyChecking` / config
     include requirement to `items/dev/sandbox-image.md` as a new
     SAND item
   - Update LCD-5 to reference the new SAND item via a Where
     precondition (allowed by [META-14](../meta.md#meta-14))
   - Update any `Verifies:` lines in `items/test/` that cite LCD-6

## Acceptance criteria

- `specs/items/user/lifecycle.md` exists with LCD user items for
  `init`, `start`, `stop`
- `map.md` LCD section lists user, dev, and test files
- `docs/cli-reference.md` exit codes for `ls` and `rm` match
  implementation and spec
- `docs/install.md` version and operation order match code
- `boss rm` abort behavior is consistent across spec, code, and docs
- LCD-55 has a passing integration test
- No spec items reference removed SAND-8 or SAND-64
- `boss scaffold` has a spec package (SCAF) with at least user and
  dev item files listed in `map.md`
- DR-002 documents `scaffold` as part of the CLI command set
- LCD-6 content lives in SAND; LCD-5 references it via precondition;
  no META-13 violations remain in LCD
