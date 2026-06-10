import { describe, it, expect, vi } from 'vitest';

import {
  executeInit,
  type InitDependencies,
  type PlatformChoice,
} from '@/main/commands/init.command.js';
import type { ConfigureMcpResult } from '@/modules/cli-configuration/usecases/cli/configureMcp.usecase.js';
import type { DiscoveredRepository } from '@/modules/cli-configuration/usecases/cli/discoverRepositories.usecase.js';

function createFakeInitDeps(overrides?: Partial<InitDependencies>): InitDependencies {
  return {
    log: vi.fn(),
    exit: vi.fn(),
    getConfigDir: vi.fn(() => '/home/user/.config/reviewflow'),
    existsSync: vi.fn(() => false),
    checkPrerequisites: vi.fn(() => ({ status: 'ok' as const })),
    confirmOverwrite: vi.fn(async () => true),
    promptPlatform: vi.fn(async () => 'both' as PlatformChoice),
    promptPort: vi.fn(async () => 3847),
    promptGitlabUsername: vi.fn(async () => 'my-gitlab-user'),
    promptGithubUsername: vi.fn(async () => 'my-github-user'),
    confirmScanRepositories: vi.fn(async () => false),
    selectRepositories: vi.fn(async (repos: DiscoveredRepository[]) => repos),
    generateWebhookSecret: vi.fn(() => 'secret-abc-123'),
    truncateSecret: vi.fn((s: string) => `${s.slice(0, 8)}...`),
    discoverRepositories: vi.fn(() => ({
      repositories: [],
      scannedPaths: [],
      skippedPaths: [],
    })),
    configureMcp: vi.fn((): ConfigureMcpResult => 'configured'),
    writeConfig: vi.fn(() => ({
      configPath: '/home/user/.config/reviewflow/config.json',
      envPath: '/home/user/.config/reviewflow/.env',
    })),
    formatSummary: vi.fn(() => 'Summary output'),
    ...overrides,
  };
}

describe('executeInit', () => {
  describe('welcome banner', () => {
    it('should display welcome banner at start', async () => {
      const log = vi.fn();
      const deps = createFakeInitDeps({ log });

      await executeInit(false, false, false, [], deps);

      const firstCall = log.mock.calls[0]?.[0];
      expect(typeof firstCall).toBe('string');
      expect(firstCall).toContain('Welcome to ReviewFlow');
    });
  });

  describe('prerequisites check', () => {
    it('should exit with code 1 when Node version is too low', async () => {
      const exit = vi.fn();
      const log = vi.fn();
      const deps = createFakeInitDeps({
        exit,
        log,
        checkPrerequisites: vi.fn(() => ({
          status: 'node-version-too-low' as const,
          found: 18,
          required: 20,
        })),
      });

      await executeInit(false, false, false, [], deps);

      expect(exit).toHaveBeenCalledWith(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Node.js'));
    });

    it('should exit with code 1 when Claude CLI is not installed', async () => {
      const exit = vi.fn();
      const log = vi.fn();
      const deps = createFakeInitDeps({
        exit,
        log,
        checkPrerequisites: vi.fn(() => ({
          status: 'claude-not-installed' as const,
          installUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
        })),
      });

      await executeInit(false, false, false, [], deps);

      expect(exit).toHaveBeenCalledWith(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Claude CLI'));
    });
  });

  describe('config overwrite', () => {
    it('should ask to overwrite when config already exists', async () => {
      const confirmOverwrite = vi.fn(async () => false);
      const writeConfig = vi.fn(() => ({
        configPath: '/config.json',
        envPath: '/.env',
      }));
      const deps = createFakeInitDeps({
        existsSync: vi.fn(() => true),
        confirmOverwrite,
        writeConfig,
      });

      await executeInit(false, false, false, [], deps);

      expect(confirmOverwrite).toHaveBeenCalled();
      expect(writeConfig).not.toHaveBeenCalled();
    });

    it('should skip overwrite prompt in --yes mode', async () => {
      const confirmOverwrite = vi.fn(async () => false);
      const writeConfig = vi.fn(() => ({
        configPath: '/config.json',
        envPath: '/.env',
      }));
      const deps = createFakeInitDeps({
        existsSync: vi.fn(() => true),
        confirmOverwrite,
        writeConfig,
      });

      await executeInit(true, false, false, [], deps);

      expect(confirmOverwrite).not.toHaveBeenCalled();
      expect(writeConfig).toHaveBeenCalled();
    });
  });

  describe('platform selection', () => {
    it('should only ask gitlab username when platform is gitlab', async () => {
      const promptGitlabUsername = vi.fn(async () => 'gitlab-user');
      const promptGithubUsername = vi.fn(async () => 'github-user');
      const deps = createFakeInitDeps({
        promptPlatform: vi.fn(async () => 'gitlab' as PlatformChoice),
        promptGitlabUsername,
        promptGithubUsername,
      });

      await executeInit(false, false, false, [], deps);

      expect(promptGitlabUsername).toHaveBeenCalled();
      expect(promptGithubUsername).not.toHaveBeenCalled();
    });

    it('should only ask github username when platform is github', async () => {
      const promptGitlabUsername = vi.fn(async () => 'gitlab-user');
      const promptGithubUsername = vi.fn(async () => 'github-user');
      const deps = createFakeInitDeps({
        promptPlatform: vi.fn(async () => 'github' as PlatformChoice),
        promptGitlabUsername,
        promptGithubUsername,
      });

      await executeInit(false, false, false, [], deps);

      expect(promptGitlabUsername).not.toHaveBeenCalled();
      expect(promptGithubUsername).toHaveBeenCalled();
    });

    it('should ask both usernames when platform is both', async () => {
      const promptGitlabUsername = vi.fn(async () => 'gitlab-user');
      const promptGithubUsername = vi.fn(async () => 'github-user');
      const deps = createFakeInitDeps({
        promptPlatform: vi.fn(async () => 'both' as PlatformChoice),
        promptGitlabUsername,
        promptGithubUsername,
      });

      await executeInit(false, false, false, [], deps);

      expect(promptGitlabUsername).toHaveBeenCalled();
      expect(promptGithubUsername).toHaveBeenCalled();
    });
  });

  describe('--yes mode (non-interactive)', () => {
    it('should use defaults without prompting', async () => {
      const promptPlatform = vi.fn(async () => 'gitlab' as PlatformChoice);
      const promptPort = vi.fn(async () => 9999);
      const writeConfig = vi.fn(() => ({
        configPath: '/config.json',
        envPath: '/.env',
      }));
      const deps = createFakeInitDeps({
        promptPlatform,
        promptPort,
        writeConfig,
      });

      await executeInit(true, false, false, [], deps);

      expect(promptPlatform).not.toHaveBeenCalled();
      expect(promptPort).not.toHaveBeenCalled();
      expect(writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3847,
          gitlabUsername: '',
          githubUsername: '',
        }),
      );
    });
  });

  describe('secrets generation', () => {
    it('should always generate both secrets regardless of platform', async () => {
      const generateWebhookSecret = vi.fn(() => 'secret-value');
      const writeConfig = vi.fn(() => ({
        configPath: '/config.json',
        envPath: '/.env',
      }));
      const deps = createFakeInitDeps({
        promptPlatform: vi.fn(async () => 'gitlab' as PlatformChoice),
        generateWebhookSecret,
        writeConfig,
      });

      await executeInit(false, false, false, [], deps);

      expect(generateWebhookSecret).toHaveBeenCalledTimes(2);
      expect(writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          gitlabWebhookSecret: 'secret-value',
          githubWebhookSecret: 'secret-value',
        }),
      );
    });

    it('should display full secrets when showSecrets is true', async () => {
      const log = vi.fn();
      const deps = createFakeInitDeps({
        log,
        generateWebhookSecret: vi.fn(() => 'full-secret-value-here'),
      });

      await executeInit(false, false, true, [], deps);

      const allLogs = log.mock.calls.map((c) => c[0]).join('\n');
      expect(allLogs).toContain('GitLab: full-secret-value-here');
      expect(allLogs).toContain('GitHub: full-secret-value-here');
    });

    it('should display truncated secrets when showSecrets is false', async () => {
      const log = vi.fn();
      const truncateSecret = vi.fn(() => 'abc123...');
      const deps = createFakeInitDeps({
        log,
        truncateSecret,
      });

      await executeInit(false, false, false, [], deps);

      expect(truncateSecret).toHaveBeenCalledTimes(2);
      const allLogs = log.mock.calls.map((c) => c[0]).join('\n');
      expect(allLogs).toContain('GitLab: abc123...');
      expect(allLogs).toContain('GitHub: abc123...');
    });
  });

  describe('repository scanning', () => {
    it('should skip scan when user declines', async () => {
      const discoverRepositories = vi.fn(() => ({
        repositories: [],
        scannedPaths: [],
        skippedPaths: [],
      }));
      const deps = createFakeInitDeps({
        confirmScanRepositories: vi.fn(async () => false),
        discoverRepositories,
      });

      await executeInit(false, false, false, [], deps);

      expect(discoverRepositories).not.toHaveBeenCalled();
    });

    it('should auto-scan in --yes mode', async () => {
      const discoverRepositories = vi.fn(() => ({
        repositories: [],
        scannedPaths: [],
        skippedPaths: [],
      }));
      const deps = createFakeInitDeps({ discoverRepositories });

      await executeInit(true, false, false, [], deps);

      expect(discoverRepositories).toHaveBeenCalled();
    });

    it('should call selectRepositories with discovered repos in interactive mode', async () => {
      const fakeRepos: DiscoveredRepository[] = [
        {
          name: 'app-one',
          localPath: '/projects/app-one',
          platform: 'github',
          remoteUrl: 'https://github.com/user/app-one',
          hasReviewConfig: false,
        },
        {
          name: 'app-two',
          localPath: '/projects/app-two',
          platform: 'gitlab',
          remoteUrl: 'https://gitlab.com/user/app-two',
          hasReviewConfig: true,
        },
      ];
      const selectRepositories = vi.fn(async (repos: DiscoveredRepository[]) => [repos[0]]);
      const writeConfig = vi.fn(() => ({
        configPath: '/config.json',
        envPath: '/.env',
      }));
      const deps = createFakeInitDeps({
        confirmScanRepositories: vi.fn(async () => true),
        discoverRepositories: vi.fn(() => ({
          repositories: fakeRepos,
          scannedPaths: ['/projects'],
          skippedPaths: [],
        })),
        selectRepositories,
        writeConfig,
      });

      await executeInit(false, false, false, [], deps);

      expect(selectRepositories).toHaveBeenCalledWith(fakeRepos);
      expect(writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          repositories: [{ name: 'app-one', localPath: '/projects/app-one', enabled: true }],
        }),
      );
    });
  });

  describe('MCP configuration', () => {
    it('should skip MCP when --skip-mcp is set', async () => {
      const configureMcp = vi.fn((): ConfigureMcpResult => 'configured');
      const deps = createFakeInitDeps({ configureMcp });

      await executeInit(false, true, false, [], deps);

      expect(configureMcp).not.toHaveBeenCalled();
    });

    it('should configure MCP when --skip-mcp is not set', async () => {
      const configureMcp = vi.fn((): ConfigureMcpResult => 'configured');
      const deps = createFakeInitDeps({ configureMcp });

      await executeInit(false, false, false, [], deps);

      expect(configureMcp).toHaveBeenCalled();
    });
  });

  describe('summary output', () => {
    it('should display formatted summary at the end', async () => {
      const log = vi.fn();
      const formatSummary = vi.fn(() => 'Setup complete!');
      const deps = createFakeInitDeps({ log, formatSummary });

      await executeInit(false, false, false, [], deps);

      expect(formatSummary).toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Setup complete!'));
    });
  });
});
