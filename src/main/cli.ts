#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
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

export interface StartDependencies {
  validateDependencies: () => { name: string; installUrl: string }[];
  startServer: () => Promise<unknown>;
  exit: (code: number) => void;
  error: (...args: unknown[]) => void;
}

export function executeStart(
  skipDependencyCheck: boolean,
  deps: StartDependencies,
): void {
  if (!skipDependencyCheck) {
    const missing = deps.validateDependencies();
    if (missing.length > 0) {
      deps.error('Missing dependencies:');
      for (const dep of missing) {
        deps.error(`  - ${dep.name}: ${dep.installUrl}`);
      }
      deps.exit(1);
      return;
    }
  }

  deps.startServer().catch((err) => {
    deps.error('Fatal error:', err);
    deps.exit(1);
  });
}

const isDirectlyExecuted =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  const args = parseCliArgs(process.argv.slice(2));

  switch (args.command) {
    case 'version':
      console.log(readVersion());
      break;

    case 'help':
      printHelp();
      break;

    case 'start':
      executeStart(args.skipDependencyCheck, {
        validateDependencies,
        startServer,
        exit: process.exit,
        error: console.error,
      });
      break;
  }
}
