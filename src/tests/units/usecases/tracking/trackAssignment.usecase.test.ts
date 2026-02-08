import { describe, it, expect } from 'vitest';
import { TrackAssignmentUseCase } from '../../../../usecases/tracking/trackAssignment.usecase.js';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';
import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';

describe('TrackAssignmentUseCase', () => {
  const mrInfo = {
    mrNumber: 42,
    title: 'Fix login bug',
    url: 'https://gitlab.com/project/-/merge_requests/42',
    project: 'my/project',
    platform: 'gitlab' as const,
    sourceBranch: 'fix-login',
    targetBranch: 'main',
  };

  const assignedBy = { username: 'alice', displayName: 'Alice' };

  it('should create a new tracked MR on first assignment', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new TrackAssignmentUseCase(gateway);

    const result = useCase.execute({ projectPath: '/my/project', mrInfo, assignedBy });

    expect(result.id).toBe('gitlab-my/project-42');
    expect(result.state).toBe('pending-review');
    expect(result.assignment.username).toBe('alice');
    expect(gateway.getById('/my/project', 'gitlab-my/project-42')).toBeDefined();
  });

  it('should update assignment info on re-assignment without resetting state', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const existing = TrackedMrFactory.create({
      id: 'gitlab-my/project-42',
      mrNumber: 42,
      platform: 'gitlab',
      project: 'my/project',
      state: 'pending-fix',
      assignment: { username: 'bob', assignedAt: '2024-01-01T00:00:00Z' },
    });
    gateway.create('/my/project', existing);
    const useCase = new TrackAssignmentUseCase(gateway);

    const result = useCase.execute({ projectPath: '/my/project', mrInfo, assignedBy });

    expect(result.state).toBe('pending-fix');
    expect(result.assignment.username).toBe('alice');
  });

  it('should reset state to pending-review if MR was merged', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const merged = TrackedMrFactory.create({
      id: 'gitlab-my/project-42',
      mrNumber: 42,
      platform: 'gitlab',
      project: 'my/project',
      state: 'merged',
    });
    gateway.create('/my/project', merged);
    const useCase = new TrackAssignmentUseCase(gateway);

    const result = useCase.execute({ projectPath: '/my/project', mrInfo, assignedBy });

    expect(result.state).toBe('pending-review');
  });

  it('should reset state to pending-review if MR was closed', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const closed = TrackedMrFactory.create({
      id: 'gitlab-my/project-42',
      mrNumber: 42,
      platform: 'gitlab',
      project: 'my/project',
      state: 'closed',
    });
    gateway.create('/my/project', closed);
    const useCase = new TrackAssignmentUseCase(gateway);

    const result = useCase.execute({ projectPath: '/my/project', mrInfo, assignedBy });

    expect(result.state).toBe('pending-review');
  });
});
