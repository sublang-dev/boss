#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 SubLang International <https://www.sublang.xyz>

import { Command } from 'commander';
import { scaffoldCommand } from './commands/scaffold.js';

const program = new Command();

program
  .name('iteron')
  .description('Delegate dev loops to Claude Code + Codex CLI. Iterates for hours. No API keys.')
  .version('0.1.1');

program
  .command('scaffold')
  .description('Create iteron specs directory structure and templates')
  .argument('[path]', 'target directory (defaults to git root or cwd)')
  .action(scaffoldCommand);

program.parse();
