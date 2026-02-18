// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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

export type SshAuthMode = 'keyfile' | 'off';

const VALID_SSH_MODES: ReadonlySet<SshAuthMode> = new Set(['keyfile', 'off']);

export interface SshAuthConfig {
  mode: SshAuthMode;
  /** @deprecated Use keyfiles. */
  keyfile?: string;
  keyfiles?: string[];
}

/** Profiles defined by DR-003 §1. Only 'local' is currently implemented. */
export type AuthProfile = 'local' | 'aws';

const SUPPORTED_AUTH_PROFILES: ReadonlySet<AuthProfile> = new Set(['local']);

export interface AuthConfig {
  profile: AuthProfile;
  ssh?: SshAuthConfig;
}

export interface IteronConfig {
  container: ContainerConfig;
  agents: Record<string, AgentConfig>;
  auth?: AuthConfig;
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
    auth: {
      profile: 'local',
      ssh: {
        mode: 'off',
        keyfiles: ['~/.ssh/id_ed25519'],
      },
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

  if (config.auth?.profile && !SUPPORTED_AUTH_PROFILES.has(config.auth.profile)) {
    throw new Error(
      `Unsupported auth profile "${config.auth.profile}". Supported: ${[...SUPPORTED_AUTH_PROFILES].join(', ')}.`,
    );
  }

  if (config.auth?.ssh) {
    const { mode } = config.auth.ssh;
    if (!mode) {
      throw new Error(
        `Missing required [auth.ssh] mode. Valid: ${[...VALID_SSH_MODES].join(', ')}.`,
      );
    }
    if (!VALID_SSH_MODES.has(mode)) {
      throw new Error(
        `Invalid [auth.ssh] mode "${mode}". Valid: ${[...VALID_SSH_MODES].join(', ')}.`,
      );
    }

    // Migrate deprecated keyfile → keyfiles
    if (config.auth.ssh.keyfile && !config.auth.ssh.keyfiles) {
      config.auth.ssh.keyfiles = [config.auth.ssh.keyfile];
      delete config.auth.ssh.keyfile;
    }

    // Validate keyfiles when mode is keyfile
    if (mode === 'keyfile' && config.auth.ssh.keyfiles) {
      if (!Array.isArray(config.auth.ssh.keyfiles) || config.auth.ssh.keyfiles.length === 0) {
        throw new Error('[auth.ssh] keyfiles must be a non-empty array when mode is "keyfile".');
      }
      for (const kf of config.auth.ssh.keyfiles) {
        if (typeof kf !== 'string' || kf.trim() === '') {
          throw new Error('[auth.ssh] keyfiles entries must be non-empty strings.');
        }
      }
    }
  }

  return config;
}

/**
 * Resolve SSH key paths from config. Returns absolute host paths
 * when mode is "keyfile", or an empty array when SSH is off or unconfigured.
 */
export function resolveSshKeyPaths(config: IteronConfig): string[] {
  const ssh = config.auth?.ssh;
  if (!ssh || ssh.mode !== 'keyfile') return [];
  let raw = ssh.keyfiles;
  if (!raw || raw.length === 0) {
    // Fallback: legacy keyfile field or hard default
    raw = [ssh.keyfile ?? '~/.ssh/id_ed25519'];
  }
  return raw.map(p => p.startsWith('~/') ? join(homedir(), p.slice(2)) : resolve(p));
}

/**
 * Disambiguate duplicate basenames across SSH key paths.
 * Returns a map from absolute host path → unique container filename.
 * When basenames are unique, the basename is used as-is.
 * When duplicates exist, the parent directory name is prefixed
 * (e.g., `github/id_ed25519` → `github_id_ed25519`).
 */
export function uniqueSshKeyNames(paths: string[]): Map<string, string> {
  const result = new Map<string, string>();
  // Group paths by basename
  const groups = new Map<string, string[]>();
  for (const p of paths) {
    const base = basename(p);
    const arr = groups.get(base) ?? [];
    arr.push(p);
    groups.set(base, arr);
  }
  const used = new Set<string>();
  for (const [base, members] of groups) {
    if (members.length === 1) {
      result.set(members[0], base);
      used.add(base);
    } else {
      for (const p of members) {
        let candidate = `${basename(dirname(p))}_${base}`;
        if (used.has(candidate)) {
          let i = 2;
          while (used.has(`${candidate}_${i}`)) i++;
          candidate = `${candidate}_${i}`;
        }
        result.set(p, candidate);
        used.add(candidate);
      }
    }
  }
  return result;
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
