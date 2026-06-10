import { describe, it, expect } from 'vitest';

import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { DiffStatsFactory } from '@/tests/factories/diffStats.factory.js';

import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';

describe('RecordReviewCompletionUseCase', () => {
  const reviewData = {
    type: 'review' as const,
    durationMs: 60000,
    score: 8,
    blocking: 2,
    warnings: 3,
    suggestions: 1,
    threadsOpened: 2,
    threadsClosed: 0,
  };

  it('should record review event and update aggregates', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1' });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({ projectPath: '/project', mrId: 'mr-1', reviewData });

    expect(result).not.toBeNull();
    expect(result?.reviews).toHaveLength(1);
    expect(result?.totalReviews).toBe(1);
    expect(result?.totalBlocking).toBe(2);
    expect(result?.totalWarnings).toBe(3);
    expect(result?.totalSuggestions).toBe(1);
    expect(result?.totalDurationMs).toBe(60000);
    expect(result?.latestScore).toBe(8);
  });

  it('should transition to pending-fix when blocking issues exist', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-review' });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, blocking: 1 },
    });

    expect(result?.state).toBe('pending-fix');
  });

  it('should transition to pending-approval when no blocking issues', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-review', openThreads: 0 });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, blocking: 0, threadsOpened: 0 },
    });

    expect(result?.state).toBe('pending-approval');
  });

  it('should track open threads from review', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', openThreads: 1 });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, threadsOpened: 3, threadsClosed: 1 },
    });

    expect(result?.openThreads).toBe(3);
    expect(result?.totalThreads).toBe(3);
  });

  it('should record followup type separately', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1' });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, type: 'followup' },
    });

    expect(result?.totalFollowups).toBe(1);
    expect(result?.totalReviews).toBe(0);
  });

  it('should set latestScore to the most recent review score', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      id: 'mr-1',
      reviews: [
        {
          type: 'review',
          timestamp: '2024-01-01T00:00:00Z',
          durationMs: 1000,
          score: 6,
          blocking: 0,
          warnings: 0,
          suggestions: 0,
          threadsClosed: 0,
          threadsOpened: 0,
          diffStats: null,
        },
      ],
      totalReviews: 1,
      latestScore: 6,
    });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, score: 10 },
    });

    expect(result?.latestScore).toBe(10);
  });

  it('should update latestScore from followup', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      id: 'mr-1',
      reviews: [
        {
          type: 'review',
          timestamp: '2024-01-01T00:00:00Z',
          durationMs: 1000,
          score: 5,
          blocking: 1,
          warnings: 0,
          suggestions: 0,
          threadsClosed: 0,
          threadsOpened: 1,
          diffStats: null,
        },
      ],
      totalReviews: 1,
      latestScore: 5,
      openThreads: 1,
      totalThreads: 1,
    });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: {
        type: 'followup',
        durationMs: 30000,
        score: 8,
        blocking: 0,
        warnings: 0,
        suggestions: 0,
        threadsClosed: 1,
      },
    });

    expect(result?.latestScore).toBe(8);
  });

  it('should record diffStats in review event when provided', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1' });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const diffStats = DiffStatsFactory.create({ commitsCount: 5, additions: 200, deletions: 50 });
    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, diffStats },
    });

    expect(result).not.toBeNull();
    expect(result?.reviews).toHaveLength(1);
    expect(result?.reviews[0].diffStats).toEqual({
      commitsCount: 5,
      additions: 200,
      deletions: 50,
    });
  });

  it('should set diffStats to null when not provided', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1' });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({ projectPath: '/project', mrId: 'mr-1', reviewData });

    expect(result).not.toBeNull();
    expect(result?.reviews[0].diffStats).toBeNull();
  });

  it('should return null for unknown MR', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({ projectPath: '/project', mrId: 'unknown-mr', reviewData });

    expect(result).toBeNull();
  });

  it('should stay in pending-fix when score is below threshold even without blockers', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-review', openThreads: 0 });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, score: 6, blocking: 0, threadsOpened: 0 },
      qualityThreshold: 7,
    });

    expect(result?.state).toBe('pending-fix');
    expect(result?.latestScore).toBe(6);
  });

  it('should transition to pending-approval when score meets threshold and no blockers', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-review', openThreads: 0 });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, score: 8, blocking: 0, threadsOpened: 0 },
      qualityThreshold: 7,
    });

    expect(result?.state).toBe('pending-approval');
  });

  it('should stay in pending-fix when blockers are present even with score above threshold', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-review', openThreads: 0 });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, score: 9, blocking: 1, threadsOpened: 1 },
      qualityThreshold: 7,
    });

    expect(result?.state).toBe('pending-fix');
  });

  it('should clear an active bypass when a new completed review arrives', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      id: 'mr-1',
      state: 'pending-approval',
      bypass: { author: 'alice', reason: 'hotfix', recordedAt: '2026-05-25T08:00:00.000Z' },
    });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, score: 8, blocking: 0, threadsOpened: 0 },
      qualityThreshold: 7,
    });

    expect(result?.bypass).toBeNull();
    expect(result?.state).toBe('pending-approval');
  });

  it('should preserve legacy behavior when qualityThreshold is null', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-review', openThreads: 0 });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, score: 3, blocking: 0, threadsOpened: 0 },
      qualityThreshold: null,
    });

    expect(result?.state).toBe('pending-approval');
  });
});
