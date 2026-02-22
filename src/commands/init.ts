// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { createInterface } from 'node:readline';
import { detectPlatform, needsMachine, detectInstallMethod, podmanInstallCommand, PODMAN_PKG_URL } from '../utils/platform.js';
import {
  isPodmanInstalled,
  isPodmanFunctional,
  machineExists,
  isMachineRunning,
  initMachine,
  startMachine,
  imageExists,
  pullImage,
  createVolume,
  volumeExists,
  installPodman,
  downloadAndInstallPkg,
  podmanErrorMessage,
} from '../utils/podman.js';
import {
  writeConfig,
  reconcileConfigImage,
  writeEnvTemplate,
  DEFAULT_IMAGE,
  VOLUME_NAME,
} from '../utils/config.js';

function step(label: string, status: 'created' | 'updated' | 'skipped' | 'done'): void {
  const tag = status === 'skipped'
    ? '(skipped)'
    : status === 'created'
      ? '(created)'
      : status === 'updated'
        ? '(updated)'
        : '(done)';
  console.log(`  ${label} ${tag}`);
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [Y/n] `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === '' || a === 'y' || a === 'yes');
    });
  });
}

export async function initCommand(options: { image?: string; yes?: boolean }): Promise<void> {
  try {
    const platform = detectPlatform();
    console.log(`Detected platform: ${platform.os}/${platform.arch}`);

    // 1. Check Podman installed — offer to install if missing
    if (!(await isPodmanInstalled())) {
      const method = detectInstallMethod(platform);

      if (method === 'pkg') {
        console.log(`\nPodman is not installed. Download and install the official .pkg?\n\n  ${PODMAN_PKG_URL}\n`);
      } else {
        const cmd = podmanInstallCommand(method);
        console.log(`\nPodman is not installed. Install it now?\n\n  ${cmd.join(' ')}\n`);
      }

      const yes = options.yes || await confirm('Proceed?');
      if (!yes) {
        console.log('Aborted. Install Podman manually, then re-run "boss init".');
        process.exit(1);
      }

      if (method === 'pkg') {
        await downloadAndInstallPkg(PODMAN_PKG_URL);
      } else {
        const cmd = podmanInstallCommand(method);
        console.log(`Running: ${cmd.join(' ')}`);
        await installPodman(cmd);
      }

      if (!(await isPodmanInstalled())) {
        console.error('Podman installation did not complete successfully.');
        process.exit(1);
      }
      step('Podman install', 'done');
    } else {
      step('Podman installed', 'skipped');
    }

    // 2–3. Machine init/start on macOS
    if (needsMachine(platform)) {
      if (await machineExists()) {
        step('Podman machine init', 'skipped');
      } else {
        console.log('  Initializing Podman machine (4 GB, 2 vCPU)...');
        await initMachine();
        step('Podman machine init', 'created');
      }

      if (await isMachineRunning()) {
        step('Podman machine start', 'skipped');
      } else {
        console.log('  Starting Podman machine...');
        await startMachine();
        step('Podman machine start', 'done');
      }
    }

    // 4. Verify rootless mode
    if (await isPodmanFunctional()) {
      step('Rootless mode', 'done');
    } else {
      console.error('Error: Podman is not running in rootless mode.');
      process.exit(1);
    }

    // 5. Pull OCI image
    const image = options.image ?? DEFAULT_IMAGE;
    if (await imageExists(image)) {
      step(`Image ${image}`, 'skipped');
    } else {
      console.log(`  Pulling image ${image}...`);
      await pullImage(image);
      step(`Image ${image}`, 'done');
    }

    // 6. Create volume
    if (await volumeExists(VOLUME_NAME)) {
      step(`Volume "${VOLUME_NAME}"`, 'skipped');
    } else {
      await createVolume(VOLUME_NAME);
      step(`Volume "${VOLUME_NAME}"`, 'created');
    }

    // 7. Generate config
    const configCreated = await writeConfig(image);
    if (configCreated) {
      step('Config ~/.boss/config.toml', 'created');
    } else {
      const configUpdated = await reconcileConfigImage(image, { force: Boolean(options.image) });
      step('Config ~/.boss/config.toml', configUpdated ? 'updated' : 'skipped');
    }

    // 8. Generate .env template
    const envCreated = await writeEnvTemplate();
    step('Env template ~/.boss/.env', envCreated ? 'created' : 'skipped');

    console.log('\nInitialization complete.');
  } catch (error) {
    console.error(`\nError: ${podmanErrorMessage(error)}`);
    process.exit(1);
  }
}
