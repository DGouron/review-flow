import { describe, it, expect } from 'vitest';
import { CheckFollowupNeededUseCase } from '../../../../usecases/tracking/checkFollowupNeeded.usecase.js';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';
import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';

describe('CheckFollowupNeededUseCase', () => {
  it('should return true when a push happened after the last review', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-fix',
      lastReviewAt: '2024-01-15T10:00:00Z',
      lastPushAt: '2024-01-15T12:00:00Z',
    });
    gateway.create('/project', mr);
    const useCase = new CheckFollowupNeededUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrNumber: 42,
      platform: 'gitlab',
    });

    expect(result).toBe(true);
  });

  it('should return false when MR is not in pending-fix state', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-approval',
      lastReviewAt: '2024-01-15T10:00:00Z',
      lastPushAt: '2024-01-15T12:00:00Z',
    });
    gateway.create('/project', mr);
    const useCase = new CheckFollowupNeededUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrNumber: 42,
      platform: 'gitlab',
    });

    expect(result).toBe(false);
  });

  it('should return false when MR does not exist', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new CheckFollowupNeededUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrNumber: 999,
      platform: 'gitlab',
    });

    expect(result).toBe(false);
  });

  it('should return false when no push happened after review', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-fix',
      lastReviewAt: '2024-01-15T12:00:00Z',
      lastPushAt: '2024-01-15T10:00:00Z',
    });
    gateway.create('/project', mr);
    const useCase = new CheckFollowupNeededUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrNumber: 42,
      platform: 'gitlab',
    });

    expect(result).toBe(false);
  });
});
