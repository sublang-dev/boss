// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 SubLang International <https://sublang.ai>

import { mkdir, copyFile, readdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

export interface CreateDirResult {
  path: string;
  created: boolean;
}

/**
 * Create a directory if it doesn't exist.
 */
async function ensureDir(dirPath: string): Promise<CreateDirResult> {
  if (existsSync(dirPath)) {
    return { path: dirPath, created: false };
  }
  await mkdir(dirPath, { recursive: true });
  return { path: dirPath, created: true };
}

/**
 * Create the boss specs directory structure.
 */
export async function createSpecsStructure(basePath: string): Promise<{
  specsDir: string;
  subDirs: CreateDirResult[];
}> {
  const specsDir = join(basePath, 'specs');
  const subfolders = ['decisions', 'iterations', 'user', 'dev', 'test'];

  // Create specs directory first
  await ensureDir(specsDir);

  // Create all subdirectories
  const subDirs = await Promise.all(
    subfolders.map(folder => ensureDir(join(specsDir, folder)))
  );

  return { specsDir, subDirs };
}

export interface CopyResult {
  path: string;
  copied: boolean;
}

/**
 * Get the scaffolding directory path.
 */
function getScaffoldingDir(): string {
  // __dirname is dist/utils, go up to package root
  const distDir = dirname(__dirname);
  return join(dirname(distDir), 'scaffolding');
}

/**
 * Recursively copy template files to destination.
 * Only copies files that don't already exist.
 */
async function copyTemplateDir(
  srcDir: string,
  destDir: string,
  results: CopyResult[]
): Promise<void> {
  const entries = await readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory()) {
      await ensureDir(destPath);
      await copyTemplateDir(srcPath, destPath, results);
    } else {
      if (existsSync(destPath)) {
        results.push({ path: destPath, copied: false });
      } else {
        await ensureDir(dirname(destPath));
        await copyFile(srcPath, destPath);
        results.push({ path: destPath, copied: true });
      }
    }
  }
}

/**
 * Copy scaffolding spec templates to the specs directory.
 */
export async function copyTemplates(specsDir: string): Promise<CopyResult[]> {
  const scaffoldingDir = getScaffoldingDir();
  const specsTemplateDir = join(scaffoldingDir, 'specs');
  const results: CopyResult[] = [];

  if (existsSync(specsTemplateDir)) {
    await copyTemplateDir(specsTemplateDir, specsDir, results);
  }

  return results;
}

export interface AppendAgentSpecsResult {
  path: string;
  action: 'created' | 'appended' | 'skipped';
}

/**
 * Append agent specs instructions to a single file.
 * Does not append if the content is already present.
 */
async function appendSpecsToFile(
  filePath: string,
  specsContent: string,
  createIfMissing: boolean
): Promise<AppendAgentSpecsResult | null> {
  if (existsSync(filePath)) {
    const existingContent = await readFile(filePath, 'utf-8');
    if (existingContent.includes('## Specs (Source of Truth)')) {
      return { path: filePath, action: 'skipped' };
    }
    const separator = existingContent.endsWith('\n') ? '\n' : '\n\n';
    await appendFile(filePath, separator + specsContent);
    return { path: filePath, action: 'appended' };
  } else if (createIfMissing) {
    // Add a title when creating new files
    const filename = basename(filePath, '.md');
    const content = `# ${filename}\n\n${specsContent}`;
    await writeFile(filePath, content);
    return { path: filePath, action: 'created' };
  }
  return null;
}

/**
 * Append agent specs instructions to CLAUDE.md and AGENTS.md.
 * If neither exists, creates both. Otherwise appends to each that exists.
 * Does not append if the content is already present in a file.
 */
export async function appendAgentSpecs(basePath: string): Promise<AppendAgentSpecsResult[]> {
  const scaffoldingDir = getScaffoldingDir();
  const agentSpecsPath = join(scaffoldingDir, 'agent-specs.txt');

  if (!existsSync(agentSpecsPath)) {
    return [];
  }

  const specsContent = await readFile(agentSpecsPath, 'utf-8');
  const claudeMdPath = join(basePath, 'CLAUDE.md');
  const agentsMdPath = join(basePath, 'AGENTS.md');

  const claudeExists = existsSync(claudeMdPath);
  const agentsExists = existsSync(agentsMdPath);
  const neitherExists = !claudeExists && !agentsExists;

  const results: AppendAgentSpecsResult[] = [];

  // Process CLAUDE.md
  const claudeResult = await appendSpecsToFile(claudeMdPath, specsContent, neitherExists);
  if (claudeResult) results.push(claudeResult);

  // Process AGENTS.md
  const agentsResult = await appendSpecsToFile(agentsMdPath, specsContent, neitherExists);
  if (agentsResult) results.push(agentsResult);

  return results;
}
