import { describe, expect, it } from 'vitest';

import { createPlatformSync } from '@/main/platformSync.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';
import type { SyncSummary } from '@/modules/tracking/entities/platformSync/syncSummary.js';

const summary: SyncSummary = {
  syncedAt: '2026-11-26T10:00:00.000Z',
  removedClosed: 1,
  untrackedOpen: 3,
};

function repository(overrides: Partial<RepositoryConfig> = {}): RepositoryConfig {
  return {
    name: 'app',
    platform: 'github',
    remoteUrl: 'git@github.com:acme/app.git',
    localPath: '/home/user/app',
    skill: 'review',
    enabled: true,
    ...overrides,
  };
}

function buildSync(repositories: RepositoryConfig[]): {
  sync: (localPath: string) => SyncSummary | null;
  reconciled: Array<{ localPath: string; project: string }>;
} {
  const reconciled: Array<{ localPath: string; project: string }> = [];
  const sync = createPlatformSync({
    getRepositories: () => repositories,
    reconcileWithPlatform: {
      execute: (input) => {
        reconciled.push(input);
        return summary;
      },
    },
  });
  return { sync, reconciled };
}

describe('createPlatformSync', () => {
  it('reconciles an enabled GitHub repository with its owner/repo project', () => {
    const { sync, reconciled } = buildSync([repository()]);

    expect(sync('/home/user/app')).toEqual(summary);
    expect(reconciled).toEqual([{ localPath: '/home/user/app', project: 'acme/app' }]);
  });

  it('returns null for an unknown local path', () => {
    const { sync, reconciled } = buildSync([repository()]);

    expect(sync('/home/user/other')).toBeNull();
    expect(reconciled).toEqual([]);
  });

  it('returns null for a GitLab repository', () => {
    const { sync } = buildSync([
      repository({ platform: 'gitlab', remoteUrl: 'git@gitlab.com:acme/app.git' }),
    ]);

    expect(sync('/home/user/app')).toBeNull();
  });

  it('returns null for a disabled repository', () => {
    const { sync } = buildSync([repository({ enabled: false })]);

    expect(sync('/home/user/app')).toBeNull();
  });

  it('returns null when the remote URL does not name a project', () => {
    const { sync } = buildSync([repository({ remoteUrl: 'not-a-remote' })]);

    expect(sync('/home/user/app')).toBeNull();
  });
});
