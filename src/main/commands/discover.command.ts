import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_SCAN_PATHS } from '@/main/shared/cliConstants.js';
import { AddRepositoriesToConfigUseCase } from '@/modules/cli-configuration/usecases/cli/addRepositoriesToConfig.usecase.js';
import {
  DiscoverRepositoriesUseCase,
  type DiscoveredRepository,
} from '@/modules/cli-configuration/usecases/cli/discoverRepositories.usecase.js';
import { green, yellow, dim } from '@/shared/services/ansiColors.js';
import { getConfigDir } from '@/shared/services/configDir.js';

export interface DiscoverDependencies {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, content: string) => void;
  readdirSync: (path: string) => Array<{ name: string; isDirectory: () => boolean }>;
  getGitRemoteUrl: (localPath: string) => string | null;
  getConfigPath: () => string;
  log: (...args: unknown[]) => void;
  selectRepositories: (repositories: DiscoveredRepository[]) => Promise<DiscoveredRepository[]>;
}

export async function executeDiscover(
  scanPaths: string[],
  maxDepth: number,
  deps: DiscoverDependencies,
): Promise<void> {
  const configPath = deps.getConfigPath();
  const pathsToScan = scanPaths.length > 0 ? scanPaths : DEFAULT_SCAN_PATHS;

  deps.log(dim('\nScanning for repositories...'));
  const discoverer = new DiscoverRepositoriesUseCase({
    existsSync: deps.existsSync,
    readdirSync: deps.readdirSync,
    getGitRemoteUrl: deps.getGitRemoteUrl,
  });

  const discovered = discoverer.execute({ scanPaths: pathsToScan, maxDepth });
  deps.log(`  Found ${discovered.repositories.length} repositories`);

  if (discovered.repositories.length === 0) {
    deps.log(yellow('No new repositories found.'));
    return;
  }

  const selected = await deps.selectRepositories(discovered.repositories);

  if (selected.length === 0) {
    deps.log(yellow('No repositories selected.'));
    return;
  }

  const adder = new AddRepositoriesToConfigUseCase({
    readFileSync: deps.readFileSync,
    writeFileSync: deps.writeFileSync,
    existsSync: deps.existsSync,
  });

  const result = adder.execute({
    configPath,
    newRepositories: selected.map((repo) => ({
      name: repo.name,
      localPath: repo.localPath,
      enabled: true,
    })),
  });

  if (result.added.length > 0) {
    deps.log(green(`\n  Added ${result.added.length} repositories:`));
    for (const repo of result.added) {
      deps.log(green(`    + ${repo.name} (${repo.localPath})`));
    }
  }

  if (result.skipped.length > 0) {
    deps.log(dim(`  Skipped ${result.skipped.length} already configured`));
  }
}

export function createDiscoverDependencies(
  getGitRemoteUrl: (localPath: string) => string | null,
): DiscoverDependencies {
  return {
    existsSync,
    readFileSync,
    writeFileSync,
    readdirSync: (path: string) =>
      readdirSync(path, { withFileTypes: true }).map((d) => ({
        name: d.name,
        isDirectory: () => d.isDirectory(),
      })),
    getGitRemoteUrl,
    getConfigPath: () => join(getConfigDir(), 'config.json'),
    log: console.log,
    selectRepositories: async (repositories) => {
      const { checkbox } = await import('@inquirer/prompts');
      return checkbox({
        message: 'Select repositories to add:',
        choices: repositories.map((r) => ({
          name: `${r.name} ${dim(`(${r.localPath})`)}${r.hasReviewConfig ? green(' [configured]') : ''}`,
          value: r,
          checked: r.hasReviewConfig,
        })),
      });
    },
  };
}
