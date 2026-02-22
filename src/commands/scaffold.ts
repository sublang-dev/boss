// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 SubLang International <https://sublang.ai>

import { basename, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { findGitRoot } from '../utils/git.js';
import { createSpecsStructure, copyTemplates, appendAgentSpecs } from '../utils/fs.js';

/**
 * Scaffold the boss specs directory structure.
 *
 * Behavior:
 * - If path provided: use that directory (must exist)
 * - Else if inside a git repo: creates specs/ at the git root
 * - Else: creates specs/ in current directory
 */
export async function scaffoldCommand(targetPath?: string): Promise<void> {
  let basePath: string;

  if (targetPath) {
    basePath = resolve(targetPath);
    if (!existsSync(basePath)) {
      console.error(`Error: path does not exist: ${basePath}`);
      process.exit(1);
    }
    if (!statSync(basePath).isDirectory()) {
      console.error(`Error: path is not a directory: ${basePath}`);
      process.exit(1);
    }
  } else {
    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);
    basePath = gitRoot ?? cwd;

    if (gitRoot) {
      console.log(`Git repository detected at: ${gitRoot}`);
    } else {
      console.log('Not inside a git repository, using current directory');
    }
  }

  console.log(`Scaffolding boss specs in: ${basePath}`);

  try {
    const { specsDir, subDirs } = await createSpecsStructure(basePath);

    // Report results
    console.log('\nCreated directory structure:');
    console.log(`  ${specsDir}/`);

    for (const result of subDirs) {
      const status = result.created ? '(created)' : '(already exists)';
      const dirName = basename(result.path);
      console.log(`    ${dirName}/ ${status}`);
    }

    // Copy template files
    const copiedFiles = await copyTemplates(specsDir);
    if (copiedFiles.length > 0) {
      console.log('\nTemplate files:');
      for (const result of copiedFiles) {
        const status = result.copied ? '(created)' : '(already exists)';
        const relativePath = result.path.slice(specsDir.length + 1);
        console.log(`  ${relativePath} ${status}`);
      }
    }

    // Append agent specs to CLAUDE.md and AGENTS.md
    const agentSpecsResults = await appendAgentSpecs(basePath);
    if (agentSpecsResults.length > 0) {
      const statusMap = {
        created: '(created)',
        appended: '(updated)',
        skipped: '(already has specs)',
      };
      console.log('\nAgent instructions:');
      for (const result of agentSpecsResults) {
        const fileName = basename(result.path);
        console.log(`  ${fileName} ${statusMap[result.action]}`);
      }
    }

    console.log('\nBoss scaffolding complete!');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to scaffold boss: ${message}`);
    process.exit(1);
  }
}
