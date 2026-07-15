import { describe, expect, it } from 'vitest';

import { createTrackedMrId } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { RecordSizeBlockUseCase } from '@/modules/tracking/usecases/tracking/recordSizeBlock.usecase.js';
import { MrTrackingDataFactory, TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const NOW = '2026-07-15T12:00:00.000Z';

describe('RecordSizeBlockUseCase', () => {
  it('records the size block on the tracked MR', () => {
    const tracking = new InMemoryReviewRequestTrackingGateway();
    const mrId = createTrackedMrId('gitlab', 'group/project', 42);
    tracking.saveTracking(
      '/repo/project',
      MrTrackingDataFactory.withMrs([TrackedMrFactory.create({ id: mrId, mrNumber: 42 })]),
    );
    const usecase = new RecordSizeBlockUseCase(tracking);

    const result = usecase.execute({
      projectPath: '/repo/project',
      mrId,
      countedLines: 2500,
      budget: 2000,
      message: 'trop gros',
      now: () => NOW,
    });

    expect(result.kind).toBe('recorded');
    expect(tracking.getById('/repo/project', mrId)?.sizeBlock).toEqual({
      countedLines: 2500,
      budget: 2000,
      message: 'trop gros',
      blockedAt: NOW,
    });
  });

  it('returns mr-not-found when the tracked MR is absent', () => {
    const tracking = new InMemoryReviewRequestTrackingGateway();
    const usecase = new RecordSizeBlockUseCase(tracking);

    const result = usecase.execute({
      projectPath: '/repo/project',
      mrId: createTrackedMrId('gitlab', 'group/project', 99),
      countedLines: 2500,
      budget: 2000,
      message: 'trop gros',
      now: () => NOW,
    });

    expect(result.kind).toBe('mr-not-found');
  });
});
