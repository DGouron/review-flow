import { describe, it, expect, beforeEach } from 'vitest';

import { LoadRecentJobHistoryUseCase } from '@/modules/review-execution/usecases/jobHistory/loadRecentJobHistory.usecase.js';
import { JobRecordFactory } from '@/tests/factories/jobRecord.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubJobHistoryGateway } from '@/tests/stubs/jobHistory.stub.js';

describe('LoadRecentJobHistoryUseCase', () => {
  let gateway: StubJobHistoryGateway;

  beforeEach(() => {
    gateway = new StubJobHistoryGateway();
  });

  it('returns an empty array when there is no record', async () => {
    const { logger } = createCapturingLogger();
    const useCase = new LoadRecentJobHistoryUseCase({ jobHistoryGateway: gateway, logger });

    const result = await useCase.execute({
      retentionDays: 7,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });

    expect(result).toEqual([]);
  });

  it('returns records sorted descending by completedAt', async () => {
    gateway.prepopulate(
      JobRecordFactory.create({
        jobId: 'older',
        completedAt: '2026-05-23T10:00:00.000Z',
      }),
    );
    gateway.prepopulate(
      JobRecordFactory.create({
        jobId: 'newer',
        completedAt: '2026-05-24T15:00:00.000Z',
      }),
    );
    const { logger } = createCapturingLogger();
    const useCase = new LoadRecentJobHistoryUseCase({ jobHistoryGateway: gateway, logger });

    const result = await useCase.execute({
      retentionDays: 7,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });

    expect(result.map((entry) => entry.jobId)).toEqual(['newer', 'older']);
  });
});
