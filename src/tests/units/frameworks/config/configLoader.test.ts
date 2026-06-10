import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';

import { vi } from 'vitest';

import {
  validateAndEnrichConfig,
  enrichSingleRepository,
} from '@/frameworks/config/configLoader.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof fs>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof childProcess>('node:child_process');
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

function createValidConfig(userOverrides: Record<string, unknown> = {}) {
  return {
    server: { port: 3000 },
    user: {
      gitlabUsername: 'my-gitlab-user',
      githubUsername: 'my-github-user',
      ...userOverrides,
    },
    queue: { maxConcurrent: 2, deduplicationWindowMs: 5000 },
    repositories: [],
  };
}

describe('validateAndEnrichConfig', () => {
  describe('username validation', () => {
    it('should accept both non-empty usernames', () => {
      const config = createValidConfig();

      const result = validateAndEnrichConfig(config);

      expect(result.user.gitlabUsername).toBe('my-gitlab-user');
      expect(result.user.githubUsername).toBe('my-github-user');
    });

    it('should accept empty gitlabUsername with non-empty githubUsername', () => {
      const config = createValidConfig({
        gitlabUsername: '',
        githubUsername: 'my-github-user',
      });

      const result = validateAndEnrichConfig(config);

      expect(result.user.gitlabUsername).toBe('');
      expect(result.user.githubUsername).toBe('my-github-user');
    });

    it('should accept empty githubUsername with non-empty gitlabUsername', () => {
      const config = createValidConfig({
        gitlabUsername: 'my-gitlab-user',
        githubUsername: '',
      });

      const result = validateAndEnrichConfig(config);

      expect(result.user.gitlabUsername).toBe('my-gitlab-user');
      expect(result.user.githubUsername).toBe('');
    });

    it('should accept both usernames empty', () => {
      const config = createValidConfig({
        gitlabUsername: '',
        githubUsername: '',
      });

      const result = validateAndEnrichConfig(config);

      expect(result.user.gitlabUsername).toBe('');
      expect(result.user.githubUsername).toBe('');
    });

    it('should reject non-string gitlabUsername', () => {
      const config = createValidConfig({ gitlabUsername: 123 });

      expect(() => validateAndEnrichConfig(config)).toThrow('gitlabUsername');
    });

    it('should reject missing gitlabUsername field', () => {
      const config = createValidConfig();
      (config.user as Record<string, unknown>).gitlabUsername = undefined;

      expect(() => validateAndEnrichConfig(config)).toThrow('gitlabUsername');
    });

    it('should reject non-string githubUsername', () => {
      const config = createValidConfig({ githubUsername: true });

      expect(() => validateAndEnrichConfig(config)).toThrow('githubUsername');
    });

    it('should reject missing githubUsername field', () => {
      const config = createValidConfig();
      (config.user as Record<string, unknown>).githubUsername = undefined;

      expect(() => validateAndEnrichConfig(config)).toThrow('githubUsername');
    });
  });

  describe('jobHistoryRetentionDays validation (SPEC-176)', () => {
    it('defaults to 7 when the field is missing', () => {
      const config = createValidConfig();

      const result = validateAndEnrichConfig(config);

      expect(result.queue.jobHistoryRetentionDays).toBe(7);
    });

    it('accepts a custom integer between 1 and 365', () => {
      const config = createValidConfig();
      (config.queue as Record<string, unknown>).jobHistoryRetentionDays = 30;

      const result = validateAndEnrichConfig(config);

      expect(result.queue.jobHistoryRetentionDays).toBe(30);
    });

    it('rejects values below 1 with the spec French message', () => {
      const config = createValidConfig();
      (config.queue as Record<string, unknown>).jobHistoryRetentionDays = 0;

      expect(() => validateAndEnrichConfig(config)).toThrow(
        'Configuration invalide : jobHistoryRetentionDays invalide',
      );
    });

    it('rejects values above 365 with the spec French message', () => {
      const config = createValidConfig();
      (config.queue as Record<string, unknown>).jobHistoryRetentionDays = 400;

      expect(() => validateAndEnrichConfig(config)).toThrow(
        'Configuration invalide : jobHistoryRetentionDays invalide',
      );
    });

    it('rejects non-integer values with the spec French message', () => {
      const config = createValidConfig();
      (config.queue as Record<string, unknown>).jobHistoryRetentionDays = 7.5;

      expect(() => validateAndEnrichConfig(config)).toThrow(
        'Configuration invalide : jobHistoryRetentionDays invalide',
      );
    });
  });

  describe('triggerMode validation (SPEC-174)', () => {
    it('default mode when missing: falls back to full-auto', () => {
      const config = createValidConfig();

      const result = validateAndEnrichConfig(config);

      expect(result.triggerMode).toBe('full-auto');
    });

    it('accepts triggerMode "full-auto"', () => {
      const config = { ...createValidConfig(), triggerMode: 'full-auto' };

      const result = validateAndEnrichConfig(config);

      expect(result.triggerMode).toBe('full-auto');
    });

    it('accepts triggerMode "semi-auto"', () => {
      const config = { ...createValidConfig(), triggerMode: 'semi-auto' };

      const result = validateAndEnrichConfig(config);

      expect(result.triggerMode).toBe('semi-auto');
    });

    it('rejects an unknown triggerMode value with the exact French error from the spec', () => {
      const config = { ...createValidConfig(), triggerMode: 'unknown-value' };

      expect(() => validateAndEnrichConfig(config)).toThrow(
        'Mode de déclenchement invalide : valeurs autorisées « full-auto » ou « semi-auto »',
      );
    });
  });
});

describe('enrichRepository — reviewFocus derivation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function setupProjectConfigOnDisk(projectJson: Record<string, unknown>): void {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify(projectJson));
    vi.mocked(childProcess.execSync).mockImplementation(() => 'https://github.com/test/repo.git\n');
  }

  function configWithRepo(): Record<string, unknown> {
    return {
      server: { port: 3000 },
      user: { gitlabUsername: 'u', githubUsername: 'u' },
      queue: { maxConcurrent: 1, deduplicationWindowMs: 1000 },
      repositories: [{ name: 'test-repo', localPath: '/fake/path', enabled: true }],
    };
  }

  it('derives skill "review-back" when project config has reviewFocus "back" and no reviewSkill', () => {
    setupProjectConfigOnDisk({ github: true, gitlab: false, reviewFocus: 'back' });

    const result = validateAndEnrichConfig(configWithRepo());

    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0]?.skill).toBe('review-back');
  });

  it('derives skill "review-doc" when project config has reviewFocus "doc"', () => {
    setupProjectConfigOnDisk({ github: true, gitlab: false, reviewFocus: 'doc' });

    const result = validateAndEnrichConfig(configWithRepo());

    expect(result.repositories[0]?.skill).toBe('review-doc');
  });

  it('keeps explicit reviewSkill when both fields are set', () => {
    setupProjectConfigOnDisk({
      github: true,
      gitlab: false,
      reviewSkill: 'my-custom-skill',
      reviewFocus: 'back',
    });

    const result = validateAndEnrichConfig(configWithRepo());

    expect(result.repositories[0]?.skill).toBe('my-custom-skill');
  });

  it('falls back to "review-code" when neither reviewSkill nor reviewFocus is set', () => {
    setupProjectConfigOnDisk({ github: true, gitlab: false });

    const result = validateAndEnrichConfig(configWithRepo());

    expect(result.repositories[0]?.skill).toBe('review-code');
  });
});

describe('enrichSingleRepository (SPEC-177)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns a tolerant RepositoryConfig with the resolved git remote URL when present', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() =>
      JSON.stringify({ github: true, gitlab: false }),
    );
    vi.mocked(childProcess.execSync).mockImplementation(
      () => 'https://github.com/org/new-app.git\n',
    );

    const result = enrichSingleRepository({
      name: 'new-app',
      localPath: '/home/dev/new-app',
      enabled: true,
    });

    expect(result.name).toBe('new-app');
    expect(result.localPath).toBe('/home/dev/new-app');
    expect(result.enabled).toBe(true);
    expect(result.remoteUrl).toBe('https://github.com/org/new-app');
  });

  it('returns a tolerant RepositoryConfig with empty remoteUrl when git remote get-url fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(childProcess.execSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    const result = enrichSingleRepository({
      name: 'no-git',
      localPath: '/home/dev/no-git',
      enabled: true,
    });

    expect(result.name).toBe('no-git');
    expect(result.remoteUrl).toBe('');
    expect(result.platform).toBe('github');
    expect(result.skill).toBe('review-code');
  });
});
