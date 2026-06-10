import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { startCleanupScheduler } from '@/frameworks/scheduler/cleanupScheduler.js';
import type { ReviewFileGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewFile.gateway.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { InMemoryReviewFileGateway } from '@/tests/stubs/reviewFile.stub.js';
import { InMemoryReviewLogFileGateway } from '@/tests/stubs/reviewLogFile.stub.js';

describe('cleanupScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should run cleanup immediately on start', async () => {
    const reviewFileGateway = new InMemoryReviewFileGateway();
    const reviewLogFileGateway = new InMemoryReviewLogFileGateway();

    reviewFileGateway.addReview('/my/project', '2020-01-01-MR-1-review.md', '# Old review');

    const scheduler = startCleanupScheduler({
      reviewFileGateway,
      reviewLogFileGateway,
      getRepositories: () => [{ localPath: '/my/project', enabled: true }],
      logger: createStubLogger(),
    });

    await vi.advanceTimersByTimeAsync(100);

    const remaining = await reviewFileGateway.listReviews('/my/project');
    expect(remaining).toHaveLength(0);

    scheduler.stop();
  });

  it('should skip disabled repositories', async () => {
    const reviewFileGateway = new InMemoryReviewFileGateway();
    const reviewLogFileGateway = new InMemoryReviewLogFileGateway();

    reviewFileGateway.addReview('/disabled/project', '2020-01-01-MR-1-review.md', '# Old review');

    const scheduler = startCleanupScheduler({
      reviewFileGateway,
      reviewLogFileGateway,
      getRepositories: () => [{ localPath: '/disabled/project', enabled: false }],
      logger: createStubLogger(),
    });

    await vi.advanceTimersByTimeAsync(100);

    const remaining = await reviewFileGateway.listReviews('/disabled/project');
    expect(remaining).toHaveLength(1);

    scheduler.stop();
  });

  it('should return a stop function that clears the interval', () => {
    const reviewFileGateway = new InMemoryReviewFileGateway();
    const reviewLogFileGateway = new InMemoryReviewLogFileGateway();

    const scheduler = startCleanupScheduler({
      reviewFileGateway,
      reviewLogFileGateway,
      getRepositories: () => [],
      logger: createStubLogger(),
    });

    expect(typeof scheduler.stop).toBe('function');
    scheduler.stop();
  });

  it('should not throw when a repository cleanup fails', async () => {
    const reviewLogFileGateway = new InMemoryReviewLogFileGateway();

    const failingGateway: ReviewFileGateway = {
      listReviews: () => {
        throw new Error('filesystem error');
      },
      readReview: () => Promise.resolve(null),
      deleteReview: () => Promise.resolve(false),
      reviewExists: () => Promise.resolve(false),
      getReviewsDirectory: (projectPath: string) => `${projectPath}/.claude/reviews`,
    };

    const scheduler = startCleanupScheduler({
      reviewFileGateway: failingGateway,
      reviewLogFileGateway,
      getRepositories: () => [{ localPath: '/my/project', enabled: true }],
      logger: createStubLogger(),
    });

    await expect(vi.advanceTimersByTimeAsync(100)).resolves.not.toThrow();

    scheduler.stop();
  });
});
