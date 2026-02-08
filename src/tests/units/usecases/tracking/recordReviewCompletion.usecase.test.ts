import { describe, it, expect } from 'vitest';
import { RecordReviewCompletionUseCase } from '../../../../usecases/tracking/recordReviewCompletion.usecase.js';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';
import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';

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

    expect(result).toBeDefined();
    expect(result!.reviews).toHaveLength(1);
    expect(result!.totalReviews).toBe(1);
    expect(result!.totalBlocking).toBe(2);
    expect(result!.totalWarnings).toBe(3);
    expect(result!.totalSuggestions).toBe(1);
    expect(result!.totalDurationMs).toBe(60000);
    expect(result!.latestScore).toBe(8);
    expect(result!.averageScore).toBe(8);
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

    expect(result!.state).toBe('pending-fix');
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

    expect(result!.state).toBe('pending-approval');
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

    expect(result!.openThreads).toBe(3);
    expect(result!.totalThreads).toBe(3);
  });

  it('should compute average score across reviews', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      id: 'mr-1',
      reviews: [{ type: 'review', timestamp: '2024-01-01T00:00:00Z', durationMs: 1000, score: 6, blocking: 0, warnings: 0, suggestions: 0, threadsClosed: 0, threadsOpened: 0 }],
      totalReviews: 1,
    });
    gateway.create('/project', mr);
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      reviewData: { ...reviewData, score: 10 },
    });

    expect(result!.averageScore).toBe(8);
    expect(result!.latestScore).toBe(10);
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

    expect(result!.totalFollowups).toBe(1);
    expect(result!.totalReviews).toBe(0);
  });

  it('should return undefined for unknown MR', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new RecordReviewCompletionUseCase(gateway);

    const result = useCase.execute({ projectPath: '/project', mrId: 'unknown-mr', reviewData });

    expect(result).toBeUndefined();
  });
});
