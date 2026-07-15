import { describe, expect, it, vi } from 'vitest';

import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import { createTrackedMrId } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { ForceLaunchBlockedReviewUseCase } from '@/modules/tracking/usecases/tracking/forceLaunchBlockedReview.usecase.js';
import { MrTrackingDataFactory, TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const MR_ID = createTrackedMrId('gitlab', 'group/a', 1);

function buildJob(): ReviewJob {
  return {
    id: 'job-1',
    platform: 'gitlab',
    projectPath: 'group/a',
    localPath: '/repo/a',
    mrNumber: 1,
    skill: 'review',
    mrUrl: 'https://gitlab.com/group/a/-/merge_requests/1',
    sourceBranch: 'feature',
    targetBranch: 'main',
    jobType: 'review',
  };
}

function seed(tracking: InMemoryReviewRequestTrackingGateway, blocked: boolean): void {
  tracking.saveTracking(
    '/repo/a',
    MrTrackingDataFactory.withMrs([
      TrackedMrFactory.create({
        id: MR_ID,
        mrNumber: 1,
        project: 'group/a',
        sizeBlock: blocked
          ? { countedLines: 2500, budget: 2000, message: 'trop gros', blockedAt: 'now' }
          : null,
      }),
    ]),
  );
}

function noopProcessor(): (job: ReviewJob, signal: AbortSignal) => Promise<void> {
  return async () => undefined;
}

describe('ForceLaunchBlockedReviewUseCase', () => {
  it('enqueues the review and clears the size block on success', async () => {
    const tracking = new InMemoryReviewRequestTrackingGateway();
    seed(tracking, true);
    const usecase = new ForceLaunchBlockedReviewUseCase({
      reviewRequestTrackingGateway: tracking,
      enqueue: vi.fn(async () => true),
      logger: createStubLogger(),
    });

    const result = await usecase.execute({
      projectPath: '/repo/a',
      mrId: MR_ID,
      job: buildJob(),
      processor: noopProcessor(),
    });

    expect(result).toBe('launched');
    expect(tracking.getById('/repo/a', MR_ID)?.sizeBlock).toBeNull();
  });

  it('leaves the size block untouched when the enqueue is deduplicated', async () => {
    const tracking = new InMemoryReviewRequestTrackingGateway();
    seed(tracking, true);
    const usecase = new ForceLaunchBlockedReviewUseCase({
      reviewRequestTrackingGateway: tracking,
      enqueue: vi.fn(async () => false),
      logger: createStubLogger(),
    });

    const result = await usecase.execute({
      projectPath: '/repo/a',
      mrId: MR_ID,
      job: buildJob(),
      processor: noopProcessor(),
    });

    expect(result).toBe('rejected-duplicate');
    expect(tracking.getById('/repo/a', MR_ID)?.sizeBlock).not.toBeNull();
  });

  it('returns not-blocked when the MR carries no size block', async () => {
    const tracking = new InMemoryReviewRequestTrackingGateway();
    seed(tracking, false);
    const enqueue = vi.fn(async () => true);
    const usecase = new ForceLaunchBlockedReviewUseCase({
      reviewRequestTrackingGateway: tracking,
      enqueue,
      logger: createStubLogger(),
    });

    const result = await usecase.execute({
      projectPath: '/repo/a',
      mrId: MR_ID,
      job: buildJob(),
      processor: noopProcessor(),
    });

    expect(result).toBe('not-blocked');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('returns mr-not-found when the tracked MR is absent', async () => {
    const tracking = new InMemoryReviewRequestTrackingGateway();
    const usecase = new ForceLaunchBlockedReviewUseCase({
      reviewRequestTrackingGateway: tracking,
      enqueue: vi.fn(async () => true),
      logger: createStubLogger(),
    });

    const result = await usecase.execute({
      projectPath: '/repo/a',
      mrId: MR_ID,
      job: buildJob(),
      processor: noopProcessor(),
    });

    expect(result).toBe('mr-not-found');
  });
});
