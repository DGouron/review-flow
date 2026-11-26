import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startPlatformSyncScheduler } from '@/frameworks/scheduler/platformSyncScheduler.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';

function repository(localPath: string, enabled = true): RepositoryConfig {
  return {
    name: localPath,
    platform: 'github',
    remoteUrl: `git@github.com:acme${localPath}.git`,
    localPath,
    skill: 'review',
    enabled,
  };
}

describe('startPlatformSyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs every enabled repository at start', () => {
    const synced: string[] = [];

    const scheduler = startPlatformSyncScheduler({
      getRepositories: () => [repository('/one'), repository('/two', false), repository('/three')],
      syncWithPlatform: (localPath) => {
        synced.push(localPath);
        return null;
      },
      logger: createCapturingLogger().logger,
      intervalMs: 300_000,
    });

    expect(synced).toEqual(['/one', '/three']);
    scheduler.stop();
  });

  it('syncs again after the configured interval', () => {
    const synced: string[] = [];
    const scheduler = startPlatformSyncScheduler({
      getRepositories: () => [repository('/one')],
      syncWithPlatform: (localPath) => {
        synced.push(localPath);
        return null;
      },
      logger: createCapturingLogger().logger,
      intervalMs: 300_000,
    });

    vi.advanceTimersByTime(300_000);

    expect(synced).toEqual(['/one', '/one']);
    scheduler.stop();
  });

  it('keeps syncing the other repositories when one fails', () => {
    const synced: string[] = [];
    const capturing = createCapturingLogger();

    const scheduler = startPlatformSyncScheduler({
      getRepositories: () => [repository('/broken'), repository('/one')],
      syncWithPlatform: (localPath) => {
        if (localPath === '/broken') throw new Error('gh: not authenticated');
        synced.push(localPath);
        return null;
      },
      logger: capturing.logger,
      intervalMs: 300_000,
    });

    expect(synced).toEqual(['/one']);
    expect(capturing.warnMessages.some((message) => message.includes('Platform sync failed'))).toBe(
      true,
    );
    scheduler.stop();
  });

  it('stops syncing once stopped', () => {
    const synced: string[] = [];
    const scheduler = startPlatformSyncScheduler({
      getRepositories: () => [repository('/one')],
      syncWithPlatform: (localPath) => {
        synced.push(localPath);
        return null;
      },
      logger: createCapturingLogger().logger,
      intervalMs: 300_000,
    });

    scheduler.stop();
    vi.advanceTimersByTime(600_000);

    expect(synced).toEqual(['/one']);
  });
});
