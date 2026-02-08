import { describe, it, expect } from 'vitest';
import { RecordPushUseCase } from '../../../../usecases/tracking/recordPush.usecase.js';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';
import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';

describe('RecordPushUseCase', () => {
  it('should record push timestamp on matching MR', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ mrNumber: 42, platform: 'gitlab', lastPushAt: null });
    gateway.create('/project', mr);
    const useCase = new RecordPushUseCase(gateway);

    const result = useCase.execute({ projectPath: '/project', mrNumber: 42, platform: 'gitlab' });

    expect(result).toBeDefined();
    expect(result!.lastPushAt).not.toBeNull();
  });

  it('should return undefined for unknown MR', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new RecordPushUseCase(gateway);

    const result = useCase.execute({ projectPath: '/project', mrNumber: 999, platform: 'gitlab' });

    expect(result).toBeUndefined();
  });
});
