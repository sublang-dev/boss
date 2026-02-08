// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai>

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { needsMachine, podmanInstallCommand, type InstallMethod } from '../../src/utils/platform.js';

// ── needsMachine ──

describe('needsMachine', () => {
  it('returns true for macOS', () => {
    expect(needsMachine({ os: 'macos', arch: 'arm64' })).toBe(true);
  });

  it('returns false for linux', () => {
    expect(needsMachine({ os: 'linux', arch: 'amd64' })).toBe(false);
  });

  it('returns false for wsl', () => {
    expect(needsMachine({ os: 'wsl', arch: 'amd64' })).toBe(false);
  });
});

// ── podmanInstallCommand ──

describe('podmanInstallCommand', () => {
  const cases: [InstallMethod, string[]][] = [
    ['pkg', []],
    ['brew', ['brew', 'install', 'podman']],
    ['port', ['sudo', 'port', 'install', 'podman']],
    ['apt', ['sudo', 'apt-get', 'install', '-y', 'podman']],
    ['dnf', ['sudo', 'dnf', 'install', '-y', 'podman']],
    ['zypper', ['sudo', 'zypper', 'install', '-y', 'podman']],
    ['pacman', ['sudo', 'pacman', '-S', '--noconfirm', 'podman']],
    ['apk', ['sudo', 'apk', 'add', 'podman']],
  ];

  it.each(cases)('%s returns correct command', (method, expected) => {
    expect(podmanInstallCommand(method)).toEqual(expected);
  });
});

// ── detectPlatform ──
// Mock readFileSync (used by detectWSL) via a hoisted configurable mock.

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock('node:fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:fs')>();
  return { ...orig, readFileSync: mockReadFileSync };
});

describe('detectPlatform', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
    vi.resetModules();
  });

  it('detects macOS arm64', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin', arch: 'arm64' });
    const { detectPlatform } = await import('../../src/utils/platform.js');
    expect(detectPlatform()).toEqual({ os: 'macos', arch: 'arm64' });
    vi.unstubAllGlobals();
  });

  it('detects macOS amd64', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin', arch: 'x64' });
    const { detectPlatform } = await import('../../src/utils/platform.js');
    expect(detectPlatform()).toEqual({ os: 'macos', arch: 'amd64' });
    vi.unstubAllGlobals();
  });

  it('detects linux amd64', async () => {
    mockReadFileSync.mockReturnValue('Linux version 6.1.0');
    vi.stubGlobal('process', { ...process, platform: 'linux', arch: 'x64' });
    const { detectPlatform } = await import('../../src/utils/platform.js');
    expect(detectPlatform()).toEqual({ os: 'linux', arch: 'amd64' });
    vi.unstubAllGlobals();
  });

  it('detects WSL', async () => {
    mockReadFileSync.mockReturnValue('Linux version 5.15.0-1-microsoft-standard-WSL2');
    vi.stubGlobal('process', { ...process, platform: 'linux', arch: 'x64' });
    const { detectPlatform } = await import('../../src/utils/platform.js');
    expect(detectPlatform()).toEqual({ os: 'wsl', arch: 'amd64' });
    vi.unstubAllGlobals();
  });

  it('throws on unsupported platform', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32', arch: 'x64' });
    const { detectPlatform } = await import('../../src/utils/platform.js');
    expect(() => detectPlatform()).toThrow(/Unsupported platform/);
    vi.unstubAllGlobals();
  });

  it('throws on unsupported architecture', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin', arch: 'ia32' });
    const { detectPlatform } = await import('../../src/utils/platform.js');
    expect(() => detectPlatform()).toThrow(/Unsupported architecture/);
    vi.unstubAllGlobals();
  });
});

// ── detectInstallMethod ──
// Mock execFileSync (used by hasCommand) via a hoisted configurable mock.

const mockExecFileSync = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:child_process')>();
  return { ...orig, execFileSync: mockExecFileSync };
});

describe('detectInstallMethod', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    vi.resetModules();
  });

  it('returns pkg for macOS', async () => {
    const { detectInstallMethod } = await import('../../src/utils/platform.js');
    expect(detectInstallMethod({ os: 'macos', arch: 'arm64' })).toBe('pkg');
  });

  it('detects apt on linux', async () => {
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'apt-get') return '/usr/bin/apt-get';
      throw new Error('not found');
    });
    const { detectInstallMethod } = await import('../../src/utils/platform.js');
    expect(detectInstallMethod({ os: 'linux', arch: 'amd64' })).toBe('apt');
  });

  it('detects dnf on linux', async () => {
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'dnf') return '/usr/bin/dnf';
      throw new Error('not found');
    });
    const { detectInstallMethod } = await import('../../src/utils/platform.js');
    expect(detectInstallMethod({ os: 'linux', arch: 'amd64' })).toBe('dnf');
  });

  it('throws when no package manager found', async () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
    const { detectInstallMethod } = await import('../../src/utils/platform.js');
    expect(() => detectInstallMethod({ os: 'linux', arch: 'amd64' })).toThrow(/No supported package manager/);
  });
});
