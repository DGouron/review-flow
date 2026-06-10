import { describe, it, expect } from 'vitest';

import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';

import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';

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

    expect(result.ok).toBe(true);
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

    expect(result.ok).toBe(true);
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('merged');
    expect(updated?.mergedAt).not.toBeNull();
    expect(updated?.approvedAt).toBeNull();
  });

  it('should report not-found when MR does not exist', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'nonexistent',
      targetState: 'approved',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not-found');
  });

  it('should reject approval transition when quality check fails', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-approval' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'approved',
      qualityCheck: () => ({
        allowed: false,
        reason: 'below-threshold',
        message: 'Seuil qualité non atteint (6/10 < 7/10)',
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'quality-gate') {
      throw new Error('Expected quality-gate rejection');
    }
    expect(result.message).toBe('Seuil qualité non atteint (6/10 < 7/10)');
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('pending-approval');
    expect(updated?.approvedAt).toBeNull();
  });

  it('should allow approval transition when quality check passes', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-approval' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'approved',
      qualityCheck: () => ({ allowed: true }),
    });

    expect(result.ok).toBe(true);
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('approved');
  });

  it('should bypass a failing quality check when the MR has an active bypass', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      id: 'mr-1',
      state: 'pending-approval',
      bypass: {
        author: 'alice',
        reason: 'hotfix critique',
        recordedAt: '2026-05-26T12:00:00.000Z',
      },
    });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'approved',
      qualityCheck: () => ({
        allowed: false,
        reason: 'below-threshold',
        message: 'Seuil qualité non atteint (5/10 < 7/10)',
      }),
    });

    expect(result.ok).toBe(true);
    expect(gateway.getById('/project', 'mr-1')?.state).toBe('approved');
  });

  it('should reject transition when requireCurrentState does not match', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'approved' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'merged',
      requireCurrentState: 'pending-fix',
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'invalid-current-state') {
      throw new Error('Expected invalid-current-state rejection');
    }
    expect(result.currentState).toBe('approved');
    const untouched = gateway.getById('/project', 'mr-1');
    expect(untouched?.state).toBe('approved');
    expect(untouched?.mergedAt).toBeNull();
  });

  it('should accept transition when requireCurrentState matches', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-fix' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'merged',
      requireCurrentState: 'pending-fix',
    });

    expect(result.ok).toBe(true);
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('merged');
    expect(updated?.mergedAt).not.toBeNull();
  });

  it('should skip quality check for non-approval transitions', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'approved' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'merged',
      qualityCheck: () => ({
        allowed: false,
        reason: 'blockers-present',
        message: 'Issues bloquantes non résolues',
      }),
    });

    expect(result.ok).toBe(true);
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('merged');
  });
});
