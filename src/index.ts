#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 SubLang International <https://sublang.ai>

import { Command } from 'commander';
import { scaffoldCommand } from './commands/scaffold.js';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { openCommand } from './commands/open.js';
import { lsCommand } from './commands/ls.js';
import { rmCommand } from './commands/rm.js';

const program = new Command();

program
  .name('iteron')
  .description('Delegate dev loops to Claude Code + Codex CLI. Iterates for hours. No API keys.')
  .version('0.1.2')
  .enablePositionalOptions();

program
  .command('scaffold')
  .description('Create iteron specs directory structure and templates')
  .argument('[path]', 'target directory (defaults to git root or cwd)')
  .action(scaffoldCommand);

program
  .command('init')
  .description('Install Podman, pull image, create volume and config')
  .option('--image <url>', 'custom OCI image URL')
  .option('-y, --yes', 'skip confirmation prompts')
  .action(initCommand);

program
  .command('start')
  .description('Launch the sandbox container')
  .action(startCommand);

program
  .command('stop')
  .description('Stop and remove the sandbox container')
  .action(stopCommand);

program
  .command('open')
  .description('Open a workspace with an agent or shell')
  .argument('[workspace]', 'workspace directory (use ~ for home, default: ~)')
  .argument('[command]', 'agent name or command to run (default: bash)')
  .passThroughOptions(true)
  .action(openCommand);

program
  .command('ls')
  .description('List workspaces and running sessions')
  .action(lsCommand);

program
  .command('rm')
  .description('Remove a workspace and kill its sessions')
  .argument('<workspace>', 'workspace to remove')
  .action(rmCommand);

program.parse();
