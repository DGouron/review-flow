import { describe, it, expect } from 'vitest';
import { TransitionStateUseCase } from '../../../../usecases/tracking/transitionState.usecase.js';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';
import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';

describe('TransitionStateUseCase', () => {
  it('should transition MR to approved state', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-approval' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'approved',
    });

    expect(result).toBe(true);
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('approved');
    expect(updated?.approvedAt).not.toBeNull();
  });

  it('should transition MR to merged state with mergedAt timestamp', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'approved' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'merged',
    });

    expect(result).toBe(true);
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('merged');
    expect(updated?.mergedAt).not.toBeNull();
    expect(updated?.approvedAt).toBeNull();
  });

  it('should return false when MR does not exist', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'nonexistent',
      targetState: 'approved',
    });

    expect(result).toBe(false);
  });
});
