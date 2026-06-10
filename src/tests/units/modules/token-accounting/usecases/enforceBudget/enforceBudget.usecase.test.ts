import { describe, it, expect, beforeEach } from 'vitest';

import { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';
import { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';
import { TokenUsageRecordFactory } from '@/tests/factories/tokenUsage.factory.js';
import { StubBudgetGateway } from '@/tests/stubs/budget.stub.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';

describe('EnforceBudgetUseCase', () => {
  let budgetGateway: StubBudgetGateway;
  let tokenUsageGateway: StubTokenUsageGateway;
  let getBudgetStatus: GetBudgetStatusUseCase;
  let useCase: EnforceBudgetUseCase;
  const now = new Date('2026-05-20T12:00:00Z');

  beforeEach(async () => {
    budgetGateway = new StubBudgetGateway();
    tokenUsageGateway = new StubTokenUsageGateway();
    getBudgetStatus = new GetBudgetStatusUseCase({ budgetGateway, tokenUsageGateway });
    useCase = new EnforceBudgetUseCase({ getBudgetStatus });
    await budgetGateway.save({ limitUsd: 200 });
  });

  it('returns accepted=true when the current consumption is below the limit', async () => {
    tokenUsageGateway.setRecords([
      TokenUsageRecordFactory.create({
        recordedAt: '2026-05-10T00:00:00Z',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 199.99,
        },
      }),
    ]);

    const decision = await useCase.execute({ localPaths: ['/project'], now });

    expect(decision.accepted).toBe(true);
    expect(decision.status.exceeded).toBe(false);
  });

  it('returns accepted=false when the current consumption meets or exceeds the limit', async () => {
    tokenUsageGateway.setRecords([
      TokenUsageRecordFactory.create({
        recordedAt: '2026-05-10T00:00:00Z',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 200.1,
        },
      }),
    ]);

    const decision = await useCase.execute({ localPaths: ['/project'], now });

    expect(decision.accepted).toBe(false);
    expect(decision.status.exceeded).toBe(true);
  });

  it('exposes the recomputed status verbatim so callers can broadcast it', async () => {
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

    const decision = await useCase.execute({ localPaths: ['/project'], now });

    expect(decision.status.limitUsd).toBe(200);
    expect(decision.status.consumedUsd).toBe(250);
    expect(decision.status.remainingUsd).toBe(0);
  });
});
