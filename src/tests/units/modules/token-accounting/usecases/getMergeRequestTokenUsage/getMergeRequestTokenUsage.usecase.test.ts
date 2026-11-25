import { describe, it, expect } from 'vitest';

import { GetMergeRequestTokenUsageUseCase } from '@/modules/token-accounting/usecases/getMergeRequestTokenUsage/getMergeRequestTokenUsage.usecase.js';
import {
  TokenUsageFactory,
  TokenUsageRecordFactory,
} from '@/tests/factories/tokenUsage.factory.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';

const PROJECT = 'Practic-IO/practivizio-app';
const LOCAL_PATH = '/Users/me/practivizio-app';
const OTHER_LOCAL_PATH = '/Users/me/other-app';

const session = (overrides: {
  mrNumber: number;
  recordedAt: string;
  jobType?: 'review' | 'followup';
  costUsd?: number;
  projectPath?: string;
}) =>
  TokenUsageRecordFactory.create({
    projectPath: overrides.projectPath ?? PROJECT,
    mrNumber: overrides.mrNumber,
    jobType: overrides.jobType ?? 'review',
    recordedAt: overrides.recordedAt,
    sessionId: `${overrides.mrNumber}-${overrides.recordedAt}`,
    localPath: LOCAL_PATH,
    usage: TokenUsageFactory.create({ costUsd: overrides.costUsd ?? 1 }),
  });

function useCaseOver(records: ReturnType<typeof session>[]) {
  const gateway = new StubTokenUsageGateway();
  gateway.setRecordsForPath(LOCAL_PATH, records);
  gateway.setRecordsForPath(OTHER_LOCAL_PATH, [
    session({ mrNumber: 2094, recordedAt: '2026-11-20T10:00:00.000Z', projectPath: 'Other/app' }),
  ]);
  return new GetMergeRequestTokenUsageUseCase(gateway);
}

describe('GetMergeRequestTokenUsageUseCase', () => {
  it('returns every session of the pull request, reviews and follow-ups of any day, oldest first', async () => {
    const useCase = useCaseOver([
      session({ mrNumber: 2094, recordedAt: '2026-11-25T14:00:00.000Z', jobType: 'followup' }),
      session({ mrNumber: 2094, recordedAt: '2026-11-24T09:00:00.000Z' }),
      session({ mrNumber: 2088, recordedAt: '2026-11-24T10:00:00.000Z' }),
    ]);

    const usage = await useCase.execute({
      localPaths: [LOCAL_PATH, OTHER_LOCAL_PATH],
      project: PROJECT,
      mrNumber: 2094,
    });

    expect(usage.sessions.map(({ recordedAt, jobType }) => [recordedAt, jobType])).toEqual([
      ['2026-11-24T09:00:00.000Z', 'review'],
      ['2026-11-25T14:00:00.000Z', 'followup'],
    ]);
  });

  it('gives the median cost of a pull request in its project, a pull request summing all its sessions', async () => {
    const useCase = useCaseOver([
      session({ mrNumber: 1, recordedAt: '2026-11-20T10:00:00.000Z', costUsd: 1 }),
      session({ mrNumber: 2, recordedAt: '2026-11-21T10:00:00.000Z', costUsd: 1.5 }),
      session({
        mrNumber: 2,
        recordedAt: '2026-11-22T10:00:00.000Z',
        jobType: 'followup',
        costUsd: 1.5,
      }),
      session({ mrNumber: 3, recordedAt: '2026-11-22T10:00:00.000Z', costUsd: 9 }),
    ]);

    const usage = await useCase.execute({
      localPaths: [LOCAL_PATH, OTHER_LOCAL_PATH],
      project: PROJECT,
      mrNumber: 3,
    });

    expect(usage.projectMedianCostUsd).toBe(3);
  });

  it('says nothing when the pull request has no recorded session', async () => {
    const usage = await useCaseOver([]).execute({
      localPaths: [LOCAL_PATH],
      project: PROJECT,
      mrNumber: 2094,
    });

    expect(usage).toEqual({ sessions: [], projectMedianCostUsd: null });
  });
});
