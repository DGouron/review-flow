import { describe, it, expect } from 'vitest';
import { SyncThreadsUseCase } from '../../../../usecases/tracking/syncThreads.usecase.js';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';
import { InMemoryThreadFetchGateway } from '../../../stubs/threadFetch.stub.js';
import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';

describe('SyncThreadsUseCase', () => {
  it('should update thread counts from fetched threads', () => {
    const trackingGateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      id: 'mr-1',
      project: 'my/project',
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-fix',
      openThreads: 0,
      totalThreads: 0,
    });
    trackingGateway.create('/project', mr);

    const threadFetchGateway = new InMemoryThreadFetchGateway();
    threadFetchGateway.setThreads([
      { id: '1', file: 'foo.ts', line: 10, status: 'open', body: 'fix this' },
      { id: '2', file: 'bar.ts', line: 20, status: 'resolved', body: 'ok' },
      { id: '3', file: 'baz.ts', line: 5, status: 'open', body: 'issue' },
    ]);

    const useCase = new SyncThreadsUseCase(trackingGateway, threadFetchGateway);

    const result = useCase.execute({ projectPath: '/project', mrId: 'mr-1' });

    expect(result).not.toBeNull();
    expect(result!.openThreads).toBe(2);
    expect(result!.totalThreads).toBe(3);
  });

  it('should return null when MR does not exist', () => {
    const trackingGateway = new InMemoryReviewRequestTrackingGateway();
    const threadFetchGateway = new InMemoryThreadFetchGateway();
    const useCase = new SyncThreadsUseCase(trackingGateway, threadFetchGateway);

    const result = useCase.execute({ projectPath: '/project', mrId: 'nonexistent' });

    expect(result).toBeNull();
  });

  it('should transition to pending-fix when open threads exist after sync', () => {
    const trackingGateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      id: 'mr-1',
      project: 'my/project',
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-approval',
    });
    trackingGateway.create('/project', mr);

    const threadFetchGateway = new InMemoryThreadFetchGateway();
    threadFetchGateway.setThreads([
      { id: '1', file: 'foo.ts', line: 10, status: 'open', body: 'fix this' },
    ]);

    const useCase = new SyncThreadsUseCase(trackingGateway, threadFetchGateway);

    const result = useCase.execute({ projectPath: '/project', mrId: 'mr-1' });

    expect(result!.state).toBe('pending-fix');
  });

  it('should transition to pending-approval when all threads resolved', () => {
    const trackingGateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({
      id: 'mr-1',
      project: 'my/project',
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-fix',
    });
    trackingGateway.create('/project', mr);

    const threadFetchGateway = new InMemoryThreadFetchGateway();
    threadFetchGateway.setThreads([
      { id: '1', file: 'foo.ts', line: 10, status: 'resolved', body: 'fixed' },
      { id: '2', file: 'bar.ts', line: 20, status: 'resolved', body: 'done' },
    ]);

    const useCase = new SyncThreadsUseCase(trackingGateway, threadFetchGateway);

    const result = useCase.execute({ projectPath: '/project', mrId: 'mr-1' });

    expect(result!.state).toBe('pending-approval');
  });
});
