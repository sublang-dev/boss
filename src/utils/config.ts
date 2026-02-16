// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { validateSessionToken } from './session.js';

export const CONFIG_DIR = process.env.ITERON_CONFIG_DIR ?? join(homedir(), '.iteron');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.toml');
export const ENV_PATH = join(CONFIG_DIR, '.env');

export const DEFAULT_IMAGE = 'ghcr.io/sublang-dev/iteron-sandbox:latest';
export const LEGACY_DEFAULT_IMAGE = 'docker.io/library/alpine:latest';
export const DEFAULT_CONTAINER_NAME = 'iteron-sandbox';
export const DEFAULT_MEMORY = '16g';
export const VOLUME_NAME = 'iteron-data';

export interface ContainerConfig {
  name: string;
  image: string;
  memory: string;
}

export interface AgentConfig {
  binary: string;
}

export interface IteronConfig {
  container: ContainerConfig;
  agents: Record<string, AgentConfig>;
}

async function loadToml(): Promise<{ stringify: (obj: Record<string, unknown>) => string; parse: (str: string) => Record<string, unknown> }> {
  return await import('smol-toml');
}

export function defaultConfig(image?: string): IteronConfig {
  return {
    container: {
      name: DEFAULT_CONTAINER_NAME,
      image: image ?? DEFAULT_IMAGE,
      memory: DEFAULT_MEMORY,
    },
    agents: {
      claude: { binary: 'claude' },
      codex: { binary: 'codex' },
      gemini: { binary: 'gemini' },
      opencode: { binary: 'opencode' },
    },
  };
}

export async function ensureConfigDir(): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

export async function writeConfig(image?: string): Promise<boolean> {
  await ensureConfigDir();
  if (existsSync(CONFIG_PATH)) {
    return false;
  }
  const { stringify } = await loadToml();
  const config = defaultConfig(image);
  const toml = stringify(config as unknown as Record<string, unknown>);
  await writeFile(CONFIG_PATH, toml, 'utf-8');
  return true;
}

export async function reconcileConfigImage(
  image: string,
  options?: { force?: boolean },
): Promise<boolean> {
  if (!existsSync(CONFIG_PATH)) {
    return false;
  }

  const config = await readConfig();
  if (config.container.image === image) {
    return false;
  }

  const force = options?.force === true;
  const isLegacyDefault = config.container.image === LEGACY_DEFAULT_IMAGE;
  if (!force && !isLegacyDefault) {
    return false;
  }

  const { stringify } = await loadToml();
  const updated: IteronConfig = {
    ...config,
    container: {
      ...config.container,
      image,
    },
  };
  const toml = stringify(updated as unknown as Record<string, unknown>);
  await writeFile(CONFIG_PATH, toml, 'utf-8');
  return true;
}

/** Legacy agent key → canonical key. */
const LEGACY_AGENT_KEYS: Record<string, string> = {
  'claude-code': 'claude',
  'codex-cli': 'codex',
  'gemini-cli': 'gemini',
};

/**
 * Normalize legacy agent keys (claude-code → claude, etc.) in-place.
 * Returns the set of keys that were migrated (empty if none).
 */
function reconcileAgentNames(agents: Record<string, AgentConfig>): Set<string> {
  const migrated = new Set<string>();
  for (const [legacy, canonical] of Object.entries(LEGACY_AGENT_KEYS)) {
    if (legacy in agents && !(canonical in agents)) {
      agents[canonical] = agents[legacy];
      delete agents[legacy];
      migrated.add(legacy);
    }
  }
  return migrated;
}

export async function readConfig(): Promise<IteronConfig> {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error('Config not found. Run "iteron init" first.');
  }
  const { parse } = await loadToml();
  const content = await readFile(CONFIG_PATH, 'utf-8');
  const config = parse(content) as unknown as IteronConfig;

  if (config.agents) {
    reconcileAgentNames(config.agents);
  }

  for (const agentName of Object.keys(config.agents ?? {})) {
    const err = validateSessionToken(agentName, 'Agent name');
    if (err) {
      throw new Error(`Invalid config [agents.${agentName}]: ${err}`);
    }
  }

  return config;
}

const ENV_TEMPLATE = `# Headless agent authentication
# Primary: subscription tokens; Fallback: API keys
# See specs/iterations/005-headless-auth.md

# Claude Code (run \`claude setup-token\` on host)
CLAUDE_CODE_OAUTH_TOKEN=
# Claude Code fallback
ANTHROPIC_API_KEY=
# Codex CLI fallback (primary: \`codex login --device-auth\` in container)
CODEX_API_KEY=
# Gemini CLI fallback (primary: NO_BROWSER OAuth in container)
GEMINI_API_KEY=
# OpenCode / Kimi K2 (Moonshot AI)
MOONSHOT_API_KEY=
`;

/**
 * Validate a workspace name. Rejects traversal segments, absolute paths,
 * path separators, and the `@` session delimiter.
 */
export function validateWorkspace(name: string): string | null {
  if (!name || name === '~') return null;
  if (name.startsWith('/')) return 'Workspace name must not be an absolute path.';
  if (name.includes('/') || name.includes('\\')) return 'Workspace name must not contain path separators.';
  if (name === '.' || name === '..') return 'Workspace name must not be a traversal segment.';
  const tokenErr = validateSessionToken(name, 'Workspace name');
  if (tokenErr) return tokenErr;
  return null;
}

export async function writeEnvTemplate(): Promise<boolean> {
  await ensureConfigDir();
  if (existsSync(ENV_PATH)) {
    return false;
  }
  await writeFile(ENV_PATH, ENV_TEMPLATE, 'utf-8');
  return true;
}
