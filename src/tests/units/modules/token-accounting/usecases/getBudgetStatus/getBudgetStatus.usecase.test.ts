import { describe, it, expect, beforeEach } from 'vitest';

import { BUDGET_DEFAULT_USD } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';
import { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';
import { TokenUsageRecordFactory } from '@/tests/factories/tokenUsage.factory.js';
import { StubBudgetGateway } from '@/tests/stubs/budget.stub.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';

describe('GetBudgetStatusUseCase', () => {
  let budgetGateway: StubBudgetGateway;
  let tokenUsageGateway: StubTokenUsageGateway;
  let useCase: GetBudgetStatusUseCase;

  beforeEach(() => {
    budgetGateway = new StubBudgetGateway();
    tokenUsageGateway = new StubTokenUsageGateway();
    useCase = new GetBudgetStatusUseCase({ budgetGateway, tokenUsageGateway });
  });

  it('returns the default 200 limit when the budget gateway has no config persisted', async () => {
    const status = await useCase.execute({
      localPaths: ['/project'],
      now: new Date('2026-05-15T12:00:00Z'),
    });

    expect(status.limitUsd).toBe(BUDGET_DEFAULT_USD);
  });

  it('sums only TokenUsageRecord costs recorded since the start of the current calendar month', async () => {
    await budgetGateway.save({ limitUsd: 200 });
    tokenUsageGateway.setRecords([
      TokenUsageRecordFactory.create({
        recordedAt: '2026-04-29T00:00:00Z',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 999,
        },
      }),
      TokenUsageRecordFactory.create({
        recordedAt: '2026-05-01T00:00:00Z',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 20,
        },
      }),
      TokenUsageRecordFactory.create({
        recordedAt: '2026-05-15T00:00:00Z',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 28.5,
        },
      }),
    ]);

    const status = await useCase.execute({
      localPaths: ['/project'],
      now: new Date('2026-05-20T12:00:00Z'),
    });

    expect(status.consumedUsd).toBeCloseTo(48.5, 2);
  });

  it('computes remainingUsd, percentUsed (2 decimals), exceeded=false when under the limit', async () => {
    await budgetGateway.save({ limitUsd: 200 });
    tokenUsageGateway.setRecords([
      TokenUsageRecordFactory.create({
        recordedAt: '2026-05-10T00:00:00Z',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 48.5,
        },
      }),
    ]);

    const status = await useCase.execute({
      localPaths: ['/project'],
      now: new Date('2026-05-20T12:00:00Z'),
    });

    expect(status.remainingUsd).toBeCloseTo(151.5, 2);
    expect(status.percentUsed).toBeCloseTo(24.25, 2);
    expect(status.exceeded).toBe(false);
  });

  it('flags exceeded=true and clamps remainingUsd at 0 when consumed >= limit', async () => {
    await budgetGateway.save({ limitUsd: 200 });
    tokenUsageGateway.setRecords([
      TokenUsageRecordFactory.create({
        recordedAt: '2026-05-10T00:00:00Z',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 250,
        },
      }),
    ]);

    const status = await useCase.execute({
      localPaths: ['/project'],
      now: new Date('2026-05-20T12:00:00Z'),
    });

    expect(status.exceeded).toBe(true);
    expect(status.remainingUsd).toBe(0);
  });

  it('uses the injected now() so a calendar month transition zeroes consumedUsd', async () => {
    await budgetGateway.save({ limitUsd: 200 });
    tokenUsageGateway.setRecords([
      TokenUsageRecordFactory.create({
        recordedAt: '2026-05-31T23:00:00Z',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 200.5,
        },
      }),
    ]);

    const status = await useCase.execute({
      localPaths: ['/project'],
      now: new Date('2026-06-01T00:00:00Z'),
    });

    expect(status.consumedUsd).toBe(0);
    expect(status.periodStart).toBe('2026-06-01T00:00:00.000Z');
  });

  it('sums consumption across every provided localPath (R2 global)', async () => {
    await budgetGateway.save({ limitUsd: 200 });
    tokenUsageGateway.setRecordsForPath('/repo-a', [
      TokenUsageRecordFactory.create({
        localPath: '/repo-a',
        recordedAt: '2026-05-10T00:00:00Z',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 30,
        },
      }),
    ]);
    tokenUsageGateway.setRecordsForPath('/repo-b', [
      TokenUsageRecordFactory.create({
        localPath: '/repo-b',
        recordedAt: '2026-05-12T00:00:00Z',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 18.5,
        },
      }),
    ]);

    const status = await useCase.execute({
      localPaths: ['/repo-a', '/repo-b'],
      now: new Date('2026-05-20T12:00:00Z'),
    });

    expect(status.consumedUsd).toBeCloseTo(48.5, 2);
  });
});
