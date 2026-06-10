import { describe, it, expect, beforeEach } from 'vitest';

import type { JobStatus } from '@/modules/review-execution/entities/job/reviewJob.js';
import { PersistJobRecordUseCase } from '@/modules/review-execution/usecases/jobHistory/persistJobRecord.usecase.js';
import { ReviewJobFactory } from '@/tests/factories/reviewJob.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubJobHistoryGateway } from '@/tests/stubs/jobHistory.stub.js';

function makeJobStatus(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job: ReviewJobFactory.create(),
    status: 'completed',
    startedAt: new Date('2026-05-25T10:00:00.000Z'),
    completedAt: new Date('2026-05-25T10:05:00.000Z'),
    ...overrides,
  };
}

describe('PersistJobRecordUseCase', () => {
  let gateway: StubJobHistoryGateway;

  beforeEach(() => {
    gateway = new StubJobHistoryGateway();
  });

  it('appends a record with status success for a completed non-aborted job', async () => {
    const { logger } = createCapturingLogger();
    const useCase = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await useCase.execute({
      jobStatus: makeJobStatus(),
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    expect(gateway.appendCount).toBe(1);
    expect(gateway.lastAppended?.status).toBe('success');
    expect(gateway.lastAppended?.exitReason).toBeNull();
    expect(gateway.lastAppended?.durationMs).toBe(5 * 60 * 1000);
  });

  it('maps an aborted completed job to status killed', async () => {
    const { logger } = createCapturingLogger();
    const useCase = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await useCase.execute({
      jobStatus: makeJobStatus({
        status: 'failed',
        error: 'Annulé par utilisateur',
      }),
      abortSignalAborted: true,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    expect(gateway.lastAppended?.status).toBe('killed');
    expect(gateway.lastAppended?.exitReason).toBe('Annulé par utilisateur');
  });

  it('maps a failed job whose error mentions cancel to status killed', async () => {
    const { logger } = createCapturingLogger();
    const useCase = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await useCase.execute({
      jobStatus: makeJobStatus({
        status: 'failed',
        error: 'Job cancelled by upstream',
      }),
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    expect(gateway.lastAppended?.status).toBe('killed');
  });

  it('maps a failed job with a timeout error to status timeout', async () => {
    const { logger } = createCapturingLogger();
    const useCase = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await useCase.execute({
      jobStatus: makeJobStatus({
        status: 'failed',
        error: 'PQueue timeout after 1800000ms',
      }),
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    expect(gateway.lastAppended?.status).toBe('timeout');
    expect(gateway.lastAppended?.exitReason).toBe('PQueue timeout after 1800000ms');
  });

  it('maps a generic failed job to status failed', async () => {
    const { logger } = createCapturingLogger();
    const useCase = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await useCase.execute({
      jobStatus: makeJobStatus({
        status: 'failed',
        error: 'claude exit code 1',
      }),
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    expect(gateway.lastAppended?.status).toBe('failed');
    expect(gateway.lastAppended?.exitReason).toBe('claude exit code 1');
  });

  it('does not rethrow when the gateway throws and logs a French warning', async () => {
    const { logger, warnMessages } = createCapturingLogger();
    gateway.failOnAppend = true;
    const useCase = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await expect(
      useCase.execute({
        jobStatus: makeJobStatus(),
        abortSignalAborted: false,
        now: () => new Date('2026-05-25T10:05:01.000Z'),
      }),
    ).resolves.toBeUndefined();

    expect(warnMessages.some((message) => message.includes('Échec persistance job'))).toBe(true);
  });

  it('uses now() to derive completedAt when JobStatus has no completedAt', async () => {
    const { logger } = createCapturingLogger();
    const useCase = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });
    const { completedAt: _ignored, ...withoutCompletedAt } = makeJobStatus();

    await useCase.execute({
      jobStatus: withoutCompletedAt,
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T11:00:00.000Z'),
    });

    expect(gateway.lastAppended?.completedAt).toBe('2026-05-25T11:00:00.000Z');
  });

  it('persists platform, projectPath, mergeRequestId, jobType extracted from job', async () => {
    const { logger } = createCapturingLogger();
    const useCase = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await useCase.execute({
      jobStatus: makeJobStatus({
        job: ReviewJobFactory.createGitHub({ jobType: 'followup' }),
      }),
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    expect(gateway.lastAppended?.platform).toBe('github');
    expect(gateway.lastAppended?.projectPath).toBe('test-owner/test-repo');
    expect(gateway.lastAppended?.mergeRequestId).toBe(123);
    expect(gateway.lastAppended?.jobType).toBe('followup');
  });
});
