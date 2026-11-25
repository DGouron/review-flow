import { describe, it, expect } from 'vitest';

import { GetReviewTokenUsageUseCase } from '@/modules/token-accounting/usecases/getReviewTokenUsage/getReviewTokenUsage.usecase.js';
import {
  TokenUsageFactory,
  TokenUsageRecordFactory,
} from '@/tests/factories/tokenUsage.factory.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';

const LOCAL_PATH = '/Users/me/practivizio-app';

const session = (overrides: {
  mrNumber?: number;
  jobType?: 'review' | 'followup';
  recordedAt: string;
  costUsd?: number;
  sessionId?: string;
}) =>
  TokenUsageRecordFactory.create({
    jobId: `github:Practic-IO/practivizio-app:${overrides.mrNumber ?? 2094}`,
    mrNumber: overrides.mrNumber ?? 2094,
    jobType: overrides.jobType ?? 'review',
    recordedAt: overrides.recordedAt,
    sessionId: overrides.sessionId ?? overrides.recordedAt,
    localPath: LOCAL_PATH,
    usage: TokenUsageFactory.create({ costUsd: overrides.costUsd ?? 1 }),
  });

function useCaseOver(records: ReturnType<typeof session>[]) {
  const gateway = new StubTokenUsageGateway();
  gateway.setRecordsForPath(LOCAL_PATH, records);
  return new GetReviewTokenUsageUseCase(gateway);
}

describe('GetReviewTokenUsageUseCase', () => {
  it('returns the sessions of the report: same pull request, same kind of job, same day, oldest first', async () => {
    const useCase = useCaseOver([
      session({ recordedAt: '2026-11-25T14:30:00.000Z', sessionId: 'second' }),
      session({ recordedAt: '2026-11-25T10:00:00.000Z', sessionId: 'first' }),
      session({ recordedAt: '2026-11-25T11:00:00.000Z', jobType: 'followup' }),
      session({ recordedAt: '2026-11-24T11:00:00.000Z' }),
      session({ recordedAt: '2026-11-25T11:00:00.000Z', mrNumber: 2088 }),
    ]);

    const usage = await useCase.execute({
      localPath: LOCAL_PATH,
      mrNumber: 2094,
      jobType: 'review',
      day: '2026-11-25',
    });

    expect(usage.sessions.map(({ sessionId }) => sessionId)).toEqual(['first', 'second']);
  });

  it('gives the median cost of a review in the project, a review summing its sessions', async () => {
    const useCase = useCaseOver([
      session({ recordedAt: '2026-11-20T10:00:00.000Z', mrNumber: 1, costUsd: 1 }),
      session({ recordedAt: '2026-11-21T10:00:00.000Z', mrNumber: 2, costUsd: 1.5 }),
      session({ recordedAt: '2026-11-21T11:00:00.000Z', mrNumber: 2, costUsd: 1.5 }),
      session({ recordedAt: '2026-11-22T10:00:00.000Z', mrNumber: 3, costUsd: 9 }),
    ]);

    const usage = await useCase.execute({
      localPath: LOCAL_PATH,
      mrNumber: 3,
      jobType: 'review',
      day: '2026-11-22',
    });

    expect(usage.projectMedianCostUsd).toBe(3);
  });

  it('says nothing of the project when it has no recorded session', async () => {
    const usage = await useCaseOver([]).execute({
      localPath: LOCAL_PATH,
      mrNumber: 2094,
      jobType: 'review',
      day: '2026-11-25',
    });

    expect(usage).toEqual({ sessions: [], projectMedianCostUsd: null });
  });
});
