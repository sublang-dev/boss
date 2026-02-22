// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFile, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { get as httpsGet } from 'node:https';

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export function podmanExec(args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile('podman', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

/** Like podmanExec but pipes `stdin` data to the process. */
export function podmanExecStdin(args: string[], stdin: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('podman', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        const err = new Error(`podman ${args[0]} exited with code ${code}`);
        reject(Object.assign(err, { stdout, stderr }));
      }
    });
    child.on('error', reject);
    child.stdin.end(stdin);
  });
}

export async function isPodmanInstalled(): Promise<boolean> {
  try {
    await podmanExec(['--version']);
    return true;
  } catch {
    return false;
  }
}

export async function isPodmanFunctional(): Promise<boolean> {
  try {
    const { stdout } = await podmanExec(['info', '--format', '{{.Host.Security.Rootless}}']);
    return stdout === 'true';
  } catch {
    return false;
  }
}

export async function isMachineRunning(): Promise<boolean> {
  try {
    const { stdout } = await podmanExec(['machine', 'inspect', '--format', '{{.State}}']);
    return stdout.toLowerCase() === 'running';
  } catch {
    return false;
  }
}

export async function initMachine(): Promise<void> {
  await podmanExec(['machine', 'init', '--memory', '4096', '--cpus', '2']);
}

export async function startMachine(): Promise<void> {
  await podmanExec(['machine', 'start']);
}

export async function imageExists(image: string): Promise<boolean> {
  try {
    await podmanExec(['image', 'exists', image]);
    return true;
  } catch {
    return false;
  }
}

export async function pullImage(image: string): Promise<void> {
  await podmanExec(['pull', image]);
}

export async function createVolume(name: string): Promise<void> {
  await podmanExec(['volume', 'create', name]);
}

export async function volumeExists(name: string): Promise<boolean> {
  try {
    await podmanExec(['volume', 'inspect', name]);
    return true;
  } catch {
    return false;
  }
}

export async function isContainerRunning(name: string): Promise<boolean> {
  try {
    const { stdout } = await podmanExec([
      'container', 'inspect', name, '--format', '{{.State.Running}}',
    ]);
    return stdout === 'true';
  } catch {
    return false;
  }
}

export async function containerExists(name: string): Promise<boolean> {
  try {
    await podmanExec(['container', 'inspect', name]);
    return true;
  } catch {
    return false;
  }
}

export async function inspectContainer(name: string, format: string): Promise<string> {
  const { stdout } = await podmanExec(['container', 'inspect', name, '--format', format]);
  return stdout;
}

export function podmanErrorMessage(error: unknown): string {
  const err = error as { code?: string; stderr?: string; message?: string };
  if (err.code === 'ENOENT') {
    return 'Podman is not installed. Run "boss init" to set up your environment.';
  }
  if (err.stderr) {
    const lines = err.stderr.trim().split('\n');
    const last = lines[lines.length - 1];
    return last.replace(/^Error:\s*/i, '');
  }
  return err.message ?? String(error);
}

export function installPodman(command: string[]): Promise<void> {
  const [bin, ...args] = command;
  return runCommand(bin, args);
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const request = (reqUrl: string): void => {
      httpsGet(reqUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          file.close();
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', (err) => { file.close(); reject(err); });
    };
    request(url);
  });
}

export async function downloadAndInstallPkg(url: string): Promise<void> {
  const pkgPath = join(tmpdir(), 'podman-installer.pkg');
  console.log(`  Downloading ${url}...`);
  await download(url, pkgPath);
  console.log('  Running installer (may prompt for password)...');
  try {
    await runCommand('sudo', ['installer', '-pkg', pkgPath, '-target', '/']);
  } finally {
    await unlink(pkgPath).catch(() => {});
  }
}

function runCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

export function podmanSpawn(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('podman', args, { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`podman ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

export async function machineExists(): Promise<boolean> {
  try {
    await podmanExec(['machine', 'inspect']);
    return true;
  } catch {
    return false;
  }
}
