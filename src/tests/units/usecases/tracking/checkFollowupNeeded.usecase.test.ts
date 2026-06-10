import { describe, it, expect } from 'vitest';

import { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';

import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';

describe('CheckFollowupNeededUseCase', () => {
  it('should return true when a push happened after the last review (pending-fix)', () => {
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

  it('should return true on push after a clean review (pending-approval, no warnings)', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-approval',
      totalWarnings: 0,
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

  it('should return true on push after approval (re-review of new commits)', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'approved',
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

  it('should return true when pending-approval MR has warnings and push after review', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-approval',
      totalWarnings: 3,
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

  it('should return false on push to a merged MR', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'merged',
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

  it('should return false on push to a closed MR', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'closed',
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

  it('should return false when no review has happened yet', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-review',
      lastReviewAt: null,
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
