import { describe, it, expect, beforeEach } from 'vitest';

import { PruneJobHistoryUseCase } from '@/modules/review-execution/usecases/jobHistory/pruneJobHistory.usecase.js';
import { JobRecordFactory } from '@/tests/factories/jobRecord.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubJobHistoryGateway } from '@/tests/stubs/jobHistory.stub.js';

describe('PruneJobHistoryUseCase', () => {
  let gateway: StubJobHistoryGateway;

  beforeEach(() => {
    gateway = new StubJobHistoryGateway();
  });

  it('returns an empty deletedFilenames list when nothing is out of window', async () => {
    const { logger } = createCapturingLogger();
    const useCase = new PruneJobHistoryUseCase({ jobHistoryGateway: gateway, logger });

    const result = await useCase.execute({
      retentionDays: 7,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });

    expect(result.deletedFilenames).toEqual([]);
  });

  it('deletes files outside the retention window and reports their filenames', async () => {
    gateway.prepopulate(JobRecordFactory.create({ completedAt: '2026-05-10T10:00:00.000Z' }));
    gateway.prepopulate(JobRecordFactory.create({ completedAt: '2026-05-24T10:00:00.000Z' }));
    const { logger } = createCapturingLogger();
    const useCase = new PruneJobHistoryUseCase({ jobHistoryGateway: gateway, logger });

    const result = await useCase.execute({
      retentionDays: 7,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });

    expect(result.deletedFilenames).toEqual(['2026-05-10.jsonl']);
  });

  it('logs a summary of deleted filenames count', async () => {
    gateway.prepopulate(JobRecordFactory.create({ completedAt: '2026-05-10T10:00:00.000Z' }));
    const { logger, infoMessages } = createCapturingLogger();
    const useCase = new PruneJobHistoryUseCase({ jobHistoryGateway: gateway, logger });

    await useCase.execute({
      retentionDays: 7,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });

    expect(infoMessages.some((message) => message.includes('Job history pruned'))).toBe(true);
  });
});
