<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-010: Adopt Spex Scaffold Framework

## Goal

Refactor `specs/` to conform to the spex scaffold framework: `items/`
directory structure, root `meta.md`, unified package prefixes, formal
test traceability, and `map.md` organized by packages.

## Deliverables

- [x] Spec items live under `specs/items/{user,dev,test}/`
- [x] DR-000 reflects spex scaffold structure and format
- [x] Root `specs/meta.md` replaces `user/meta.md` and `dev/style.md`
- [x] Licensing package (LIC) replaces scattered SPDX specs
- [ ] Each spec package uses one prefix across all item groups
- [ ] Item IDs use `<PACK>-<N>` format (no zero-padding)
- [ ] All test items have `Verifies:` metadata lines
- [ ] `map.md` replaces `spec-map.md`, organized by packages
- [ ] `CLAUDE.md` and `AGENTS.md` updated to reference `specs/map.md`
- [ ] Existing IRs use `## Acceptance criteria` and have valid paths

## Tasks

1. **Move spec items under `items/`**
   - Create `specs/items/`
   - `git mv specs/{user,dev,test} specs/items/`
   - Update relative paths to `decisions/` and `iterations/` in all
     moved files (`../decisions/` → `../../decisions/`,
     `../iterations/` → `../../iterations/`)
   - Relative paths between `user/`, `dev/`, `test/` remain unchanged
   - Update `spec-map.md` paths (`dev/` → `items/dev/`, etc.)

2. **Replace DR-000 with spex scaffold version**
   - Rename `000-initial-specs-structure.md` →
     `000-spec-structure-format.md`
   - Adopt scaffold content; preserve SPDX headers
   - Update `spec-map.md` entry

3. **Create root `meta.md`**
   - Adopt scaffold's `meta.md` as the baseline; add only
     project-specific supplements (e.g., package table)
   - Do **not** absorb old STYLE items wholesale — several conflict
     with the scaffold (STYLE-002 mandates zero-padded IDs,
     STYLE-007 mandates `## Verification`, STYLE-010 forbids citing
     test specs; scaffold META-5/META-11/META-19 supersede all three)
   - Remove `items/user/meta.md` and `items/dev/style.md`
   - Update references from other specs that cite META or STYLE IDs
   - Standardize `## Intent` sections in remaining item files

4. **Create licensing spec package**
   - Create `items/dev/licensing.md` from scaffold (LIC-1, LIC-2),
     replacing STYLE-011 and STYLE-012
   - Preserve repo-specific `scaffold/` exclusion from STYLE-011
     (scaffold templates are copied to user projects and must not
     carry SPDX headers)
   - Carry forward STYLE-012 as LIC-3: source/spec files in this
     repo shall use `Apache-2.0` as the `SPDX-License-Identifier`
     value (the scaffold LIC items are license-agnostic; this repo
     is not; copyright text presence is covered by LIC-1/LIC-4)
   - Rename `items/test/spdx-headers.md` → `items/test/licensing.md`
   - Re-ID: SPDX-001 → LIC-4, SPDX-002 → LIC-5
   - Add `Verifies:` lines to LIC-4 and LIC-5

5. **Unify sandbox-image package IDs**
   - Choose single prefix (suggested: SAND) for the
     `sandbox-image.md` package
   - Renumber sequentially: dev items first, then user, then test
   - Drop zero-padding
   - Update all cross-references within and between spec files
   - Add `Verifies:` lines to test items in this package

6. **Unify workspace package IDs**
   - Choose single prefix (suggested: WS) for the `workspace.md`
     package
   - Renumber sequentially: dev items first, then user, then test
   - Drop zero-padding
   - Update all cross-references within and between spec files
   - Add `Verifies:` lines to test items in this package

7. **Drop zero-padding from remaining packages**
   - Affected packages: GIT (4 items), DOC (7 items), LCD (7 items),
     RELEASE (10 items)
   - `GIT-001` → `GIT-1`, `DOC-001` → `DOC-1`, `LCD-001` → `LCD-1`,
     `RELEASE-001` → `RELEASE-1`, etc.
   - Update all cross-references
   - Add `Verifies:` lines to any test items referencing these
     packages

8. **Normalize existing iteration records**
   - Rename `## Verification` → `## Acceptance criteria` in all IRs
     that still use the old heading (IR-001 through IR-009)
   - Normalize IR-000 heading casing: `## Acceptance Criteria` →
     `## Acceptance criteria`
   - Update stale paths in IR-000: `../dev/style.md` →
     `../items/dev/licensing.md`, `../test/spdx-headers.md` →
     `../items/test/licensing.md`, re-ID citations (SPDX-001 →
     LIC-4, SPDX-002 → LIC-5)
   - Sweep all IRs for paths and filenames broken by tasks 1–7
     **and** task 9 (the `spec-map.md` → `map.md` rename; e.g.,
     IR-008 line 252 mentions `spec-map.md` as a section header)

9. **Rename `spec-map.md` → `map.md` and reorganize**
   - `git mv specs/spec-map.md specs/map.md`
   - Reorganize items section by packages (per scaffold `map.md`
     format), with package short forms as section headers
   - Update `CLAUDE.md` and `AGENTS.md` to reference `specs/map.md`
   - Verify all links resolve

## Acceptance criteria

- `specs/items/{user,dev,test}/` contains all spec item files
- `specs/meta.md` exists; no `items/user/meta.md` or
  `items/dev/style.md`
- `specs/map.md` exists; no `spec-map.md`
- Each package uses one prefix across user/dev/test groups
- All item IDs follow `<PACK>-<N>` format (no zero-padding)
- All test items have `Verifies:` metadata lines citing verified items
- All cross-references resolve correctly
- `CLAUDE.md` and `AGENTS.md` reference `specs/map.md`
- All IRs use `## Acceptance criteria` heading; no stale paths
- All files retain SPDX headers
