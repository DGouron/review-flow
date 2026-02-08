#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../cli/parseCliArgs.js';
import { validateDependencies } from '../shared/services/dependencyChecker.js';
import { startServer } from './server.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  const packageJsonPath = join(currentDir, '..', '..', 'package.json');
  const raw = readFileSync(packageJsonPath, 'utf-8');
  return JSON.parse(raw).version;
}

function printHelp(): void {
  console.log(`reviewflow - Automated code review for GitLab/GitHub

Usage:
  reviewflow [command] [options]

Commands:
  start                    Start the review server (default)

Options:
  -v, --version            Show version
  -h, --help               Show this help
  --skip-dependency-check  Skip external dependency verification
`);
}

const args = parseCliArgs(process.argv.slice(2));

switch (args.command) {
  case 'version':
    console.log(readVersion());
    break;

  case 'help':
    printHelp();
    break;

  case 'start': {
    if (!args.skipDependencyCheck) {
      const missing = validateDependencies();
      if (missing.length > 0) {
        console.error('Missing dependencies:');
        for (const dep of missing) {
          console.error(`  - ${dep.name}: ${dep.installUrl}`);
        }
        process.exit(1);
      }
    }

    startServer().catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
    break;
  }
}
