import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ValidateConfigUseCase } from '@/modules/cli-configuration/usecases/cli/validateConfig.usecase.js';
import { green, red, yellow, dim, bold } from '@/shared/services/ansiColors.js';
import { getConfigDir } from '@/shared/services/configDir.js';

export interface ValidateDependencies {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  getConfigDir: () => string;
  getCwd: () => string;
  log: (...args: unknown[]) => void;
  exit: (code: number) => void;
}

export function executeValidate(fix: boolean, deps: ValidateDependencies): void {
  const configDir = deps.getConfigDir();
  const configPath = join(configDir, 'config.json');
  const envPath = join(configDir, '.env');

  const cwd = deps.getCwd();
  const cwdConfigPath = join(cwd, 'config.json');
  const resolvedConfigPath = deps.existsSync(cwdConfigPath) ? cwdConfigPath : configPath;
  const resolvedEnvPath = deps.existsSync(join(cwd, '.env')) ? join(cwd, '.env') : envPath;

  const validator = new ValidateConfigUseCase({
    existsSync: deps.existsSync,
    readFileSync: deps.readFileSync,
  });

  const result = validator.execute({ configPath: resolvedConfigPath, envPath: resolvedEnvPath });

  switch (result.status) {
    case 'not-found':
      deps.log(red('No configuration found.'));
      deps.log(dim(`Looked in: ${resolvedConfigPath}`));
      deps.log(`Run ${bold('reviewflow init')} to create one.`);
      deps.exit(1);
      break;

    case 'valid':
      deps.log(green(bold('Configuration is valid!')));
      deps.log(dim(`  Config: ${resolvedConfigPath}`));
      deps.log(dim(`  Env:    ${resolvedEnvPath}`));
      break;

    case 'invalid':
      deps.log(red(bold('Configuration has issues:')));
      for (const issue of result.issues) {
        const prefix = issue.severity === 'error' ? red('ERROR') : yellow('WARN');
        deps.log(`  ${prefix} [${issue.field}]: ${issue.message}`);
      }
      if (fix) {
        deps.log(dim('\n--fix flag detected, but no auto-fixable issues implemented yet.'));
      }
      deps.exit(1);
      break;
  }
}

export function createValidateDependencies(): ValidateDependencies {
  return {
    existsSync,
    readFileSync,
    getConfigDir,
    getCwd: () => process.cwd(),
    log: console.log,
    exit: process.exit,
  };
}
