// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export type OS = 'macos' | 'linux' | 'wsl';
export type Arch = 'amd64' | 'arm64';

export interface Platform {
  os: OS;
  arch: Arch;
}

function detectWSL(): boolean {
  try {
    const version = readFileSync('/proc/version', 'utf-8');
    return /microsoft|wsl/i.test(version);
  } catch {
    return false;
  }
}

export function detectPlatform(): Platform {
  let os: OS;
  if (process.platform === 'darwin') {
    os = 'macos';
  } else if (process.platform === 'linux') {
    os = detectWSL() ? 'wsl' : 'linux';
  } else {
    throw new Error(`Unsupported platform: ${process.platform}. Boss supports macOS, Linux, and WSL2.`);
  }

  let arch: Arch;
  if (process.arch === 'arm64') {
    arch = 'arm64';
  } else if (process.arch === 'x64') {
    arch = 'amd64';
  } else {
    throw new Error(`Unsupported architecture: ${process.arch}. Boss supports amd64 and arm64.`);
  }

  return { os, arch };
}

export function needsMachine(platform: Platform): boolean {
  return platform.os === 'macos';
}

// 'pkg' = macOS .pkg download (official recommended method)
export type InstallMethod = 'pkg' | 'brew' | 'port' | 'apt' | 'dnf' | 'zypper' | 'pacman' | 'apk';

function hasCommand(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function detectInstallMethod(platform: Platform): InstallMethod {
  if (platform.os === 'macos') {
    // .pkg is the official recommended method for macOS
    // (Homebrew is community-maintained and not recommended by Podman)
    return 'pkg';
  }
  // linux or wsl — detect native package manager
  if (hasCommand('apt-get')) return 'apt';
  if (hasCommand('dnf')) return 'dnf';
  if (hasCommand('zypper')) return 'zypper';
  if (hasCommand('pacman')) return 'pacman';
  if (hasCommand('apk')) return 'apk';
  throw new Error('No supported package manager found. Install Podman manually: https://podman.io/docs/installation');
}

export function podmanInstallCommand(method: InstallMethod): string[] {
  switch (method) {
    case 'pkg': return []; // handled separately via download
    case 'brew': return ['brew', 'install', 'podman'];
    case 'port': return ['sudo', 'port', 'install', 'podman'];
    case 'apt': return ['sudo', 'apt-get', 'install', '-y', 'podman'];
    case 'dnf': return ['sudo', 'dnf', 'install', '-y', 'podman'];
    case 'zypper': return ['sudo', 'zypper', 'install', '-y', 'podman'];
    case 'pacman': return ['sudo', 'pacman', '-S', '--noconfirm', 'podman'];
    case 'apk': return ['sudo', 'apk', 'add', 'podman'];
  }
}

// Podman release .pkg URL for macOS (universal binary)
const PODMAN_PKG_VERSION = '5.4.1';
export const PODMAN_PKG_URL = `https://github.com/containers/podman/releases/download/v${PODMAN_PKG_VERSION}/podman-installer-macos-universal.pkg`;
