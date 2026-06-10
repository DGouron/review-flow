import { execSync } from 'node:child_process';
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatInitSummary, type InitSummaryInput } from '@/cli/formatters/initSummary.js';
import { resolveMcpServerPath } from '@/frameworks/claude/claudeInvoker.js';
import { DEFAULT_SCAN_PATHS } from '@/main/shared/cliConstants.js';
import {
  checkInitPrerequisites,
  type PrerequisitesResult,
} from '@/modules/cli-configuration/usecases/cli/checkInitPrerequisites.js';
import {
  ConfigureMcpUseCase,
  type ConfigureMcpResult,
} from '@/modules/cli-configuration/usecases/cli/configureMcp.usecase.js';
import {
  DiscoverRepositoriesUseCase,
  type DiscoveredRepository,
  type DiscoverRepositoriesResult,
} from '@/modules/cli-configuration/usecases/cli/discoverRepositories.usecase.js';
import {
  WriteInitConfigUseCase,
  type WriteInitConfigInput,
  type WriteInitConfigResult,
} from '@/modules/cli-configuration/usecases/cli/writeInitConfig.usecase.js';
import { green, red, yellow, dim, bold } from '@/shared/services/ansiColors.js';
import { getConfigDir } from '@/shared/services/configDir.js';
import { checkDependency } from '@/shared/services/dependencyChecker.js';
import { generateWebhookSecret, truncateSecret } from '@/shared/services/secretGenerator.js';

export type PlatformChoice = 'gitlab' | 'github' | 'both';

export interface InitDependencies {
  log: (...args: unknown[]) => void;
  exit: (code: number) => void;
  getConfigDir: () => string;
  existsSync: (path: string) => boolean;
  checkPrerequisites: () => PrerequisitesResult;
  confirmOverwrite: (configPath: string) => Promise<boolean>;
  promptPlatform: () => Promise<PlatformChoice>;
  promptPort: () => Promise<number>;
  promptGitlabUsername: () => Promise<string>;
  promptGithubUsername: () => Promise<string>;
  confirmScanRepositories: () => Promise<boolean>;
  selectRepositories: (repos: DiscoveredRepository[]) => Promise<DiscoveredRepository[]>;
  generateWebhookSecret: () => string;
  truncateSecret: (secret: string, length: number) => string;
  discoverRepositories: (scanPaths: string[], maxDepth: number) => DiscoverRepositoriesResult;
  configureMcp: () => ConfigureMcpResult;
  writeConfig: (input: WriteInitConfigInput) => WriteInitConfigResult;
  formatSummary: (input: InitSummaryInput) => string;
}

const WELCOME_BANNER = `
Welcome to ReviewFlow!
Automated code review powered by Claude Code.
`;

export async function executeInit(
  yes: boolean,
  skipMcp: boolean,
  showSecrets: boolean,
  scanPaths: string[],
  deps: InitDependencies,
): Promise<void> {
  deps.log(WELCOME_BANNER);

  const prereqResult = deps.checkPrerequisites();
  if (prereqResult.status === 'node-version-too-low') {
    deps.log(red(`Node.js >= ${prereqResult.required} is required (found: ${prereqResult.found})`));
    deps.exit(1);
    return;
  }
  if (prereqResult.status === 'claude-not-installed') {
    deps.log(red(`Claude CLI is not installed. Install it from: ${prereqResult.installUrl}`));
    deps.exit(1);
    return;
  }

  const configDir = deps.getConfigDir();
  const configPath = join(configDir, 'config.json');

  if (deps.existsSync(configPath) && !yes) {
    const overwrite = await deps.confirmOverwrite(configPath);
    if (!overwrite) {
      deps.log(yellow('Init cancelled.'));
      return;
    }
  }

  let port = 3847;
  let gitlabUsername = '';
  let githubUsername = '';

  if (yes) {
    deps.log(dim('Non-interactive mode: using defaults'));
  } else {
    const platform = await deps.promptPlatform();
    port = await deps.promptPort();

    if (platform === 'gitlab' || platform === 'both') {
      gitlabUsername = await deps.promptGitlabUsername();
    }
    if (platform === 'github' || platform === 'both') {
      githubUsername = await deps.promptGithubUsername();
    }
  }

  const gitlabSecret = deps.generateWebhookSecret();
  const githubSecret = deps.generateWebhookSecret();

  deps.log('');
  deps.log(bold('Webhook secrets generated:'));
  if (showSecrets) {
    deps.log(`  GitLab: ${gitlabSecret}`);
    deps.log(`  GitHub: ${githubSecret}`);
  } else {
    deps.log(`  GitLab: ${deps.truncateSecret(gitlabSecret, 16)}`);
    deps.log(`  GitHub: ${deps.truncateSecret(githubSecret, 16)}`);
    deps.log(dim('  Use --show-secrets to display full values'));
  }

  const pathsToScan = scanPaths.length > 0 ? scanPaths : DEFAULT_SCAN_PATHS;
  let selectedRepos: Array<{ name: string; localPath: string; enabled: boolean }> = [];

  const shouldScan = yes || (await deps.confirmScanRepositories());

  if (shouldScan) {
    deps.log(dim('\nScanning for repositories...'));
    const discovered = deps.discoverRepositories(pathsToScan, 3);
    deps.log(`  Found ${discovered.repositories.length} repositories`);

    if (discovered.repositories.length > 0) {
      if (yes) {
        selectedRepos = discovered.repositories.map((r) => ({
          name: r.name,
          localPath: r.localPath,
          enabled: true,
        }));
      } else {
        const selected = await deps.selectRepositories(discovered.repositories);
        selectedRepos = selected.map((r) => ({
          name: r.name,
          localPath: r.localPath,
          enabled: true,
        }));
      }
    }
  }

  let mcpStatus: ConfigureMcpResult | 'skipped' | 'failed' = 'skipped';
  if (!skipMcp) {
    deps.log(dim('\nConfiguring MCP server...'));
    try {
      mcpStatus = deps.configureMcp();
    } catch {
      mcpStatus = 'failed';
    }
    deps.log(`  MCP: ${mcpStatus}`);
  }

  const result = deps.writeConfig({
    configDir,
    port,
    gitlabUsername,
    githubUsername,
    repositories: selectedRepos,
    gitlabWebhookSecret: gitlabSecret,
    githubWebhookSecret: githubSecret,
  });

  const summary = deps.formatSummary({
    configPath: result.configPath,
    envPath: result.envPath,
    port,
    repositoryCount: selectedRepos.length,
    mcpStatus,
    gitlabUsername,
    githubUsername,
  });
  deps.log(green(summary));
}

export function createInitDependencies(
  getGitRemoteUrl: (localPath: string) => string | null,
): InitDependencies {
  return {
    log: console.log,
    exit: process.exit,
    getConfigDir,
    existsSync,
    checkPrerequisites: () =>
      checkInitPrerequisites({
        executeCommand: execSync,
        getNodeMajorVersion: () => Number(process.versions.node.split('.')[0]),
      }),
    confirmOverwrite: async (configPath) => {
      const { confirm } = await import('@inquirer/prompts');
      return confirm({
        message: `Config already exists at ${configPath}. Overwrite?`,
        default: false,
      });
    },
    promptPlatform: async () => {
      const { select } = await import('@inquirer/prompts');
      return select<PlatformChoice>({
        message: 'Which platform(s) do you use?',
        choices: [
          { name: 'GitLab', value: 'gitlab' },
          { name: 'GitHub', value: 'github' },
          { name: 'Both', value: 'both' },
        ],
      });
    },
    promptPort: async () => {
      const { number: numberPrompt } = await import('@inquirer/prompts');
      const portAnswer = await numberPrompt({
        message: 'Server port:',
        default: 3847,
        validate: (value) => {
          if (value === undefined || value < 1 || value > 65535)
            return 'Port must be between 1 and 65535';
          return true;
        },
      });
      return portAnswer ?? 3847;
    },
    promptGitlabUsername: async () => {
      const { input } = await import('@inquirer/prompts');
      return input({ message: 'GitLab username:', default: '' });
    },
    promptGithubUsername: async () => {
      const { input } = await import('@inquirer/prompts');
      return input({ message: 'GitHub username:', default: '' });
    },
    confirmScanRepositories: async () => {
      const { confirm } = await import('@inquirer/prompts');
      return confirm({ message: 'Scan for repositories?', default: true });
    },
    selectRepositories: async (repositories) => {
      const { checkbox } = await import('@inquirer/prompts');
      return checkbox({
        message: 'Select repositories to configure:',
        choices: repositories.map((r) => ({
          name: `${r.name} ${dim(`(${r.localPath})`)}${r.hasReviewConfig ? green(' [configured]') : ''}`,
          value: r,
          checked: r.hasReviewConfig,
        })),
      });
    },
    generateWebhookSecret,
    truncateSecret,
    discoverRepositories: (scanPaths, maxDepth) => {
      const discoverer = new DiscoverRepositoriesUseCase({
        existsSync,
        readdirSync: (path: string) =>
          readdirSync(path, { withFileTypes: true }).map((d) => ({
            name: d.name,
            isDirectory: () => d.isDirectory(),
          })),
        getGitRemoteUrl,
      });
      return discoverer.execute({ scanPaths, maxDepth });
    },
    configureMcp: () => {
      const mcpUseCase = new ConfigureMcpUseCase({
        isClaudeInstalled: () => checkDependency({ name: 'Claude', command: 'claude --version' }),
        readFileSync,
        writeFileSync,
        existsSync,
        copyFileSync,
        resolveMcpServerPath: () => {
          try {
            return resolveMcpServerPath();
          } catch {
            return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mcpServer.js');
          }
        },
        settingsPath: join(homedir(), '.claude', 'settings.json'),
      });
      return mcpUseCase.execute();
    },
    writeConfig: (input) => {
      const writer = new WriteInitConfigUseCase({ mkdirSync, writeFileSync });
      return writer.execute(input);
    },
    formatSummary: formatInitSummary,
  };
}
