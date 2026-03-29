<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SCAF: Scaffold Implementation Requirements

## Intent

This spec defines implementation requirements for the
`boss scaffold` command.

## Directory Structure

### SCAF-7

Where `createSpecsStructure()` is called, it shall create a
`specs/` directory with subdirectories `decisions/`, `iterations/`,
`items/user/`, `items/dev/`, and `items/test/` under the resolved
base path.

## Template Copying

### SCAF-8

Where `copyTemplates()` is called, it shall recursively copy files
from the bundled `scaffold/specs/` directory to the target `specs/`
directory. Files that already exist at the destination shall not be
overwritten.

### SCAF-9

Where `getScaffoldDir()` resolves the bundled scaffold path, it
shall navigate from the `dist/` output directory up to the package
root and return the `scaffold/` directory path.

## Agent Spec Appending

### SCAF-10

Where `appendAgentSpecs()` is called, it shall read
`scaffold/agent-specs.txt` and append its content to `CLAUDE.md`
and `AGENTS.md` at the base path. When neither file exists, both
shall be created. When a file already contains the specs section
heading, the existing section shall be replaced in place.
