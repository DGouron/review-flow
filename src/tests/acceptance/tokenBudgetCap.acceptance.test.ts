import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach } from 'vitest';

import { budgetRoutes } from '@/modules/token-accounting/interface-adapters/controllers/http/budget.routes.js';
import { BudgetStatusPresenter } from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';
import { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';
import { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';
import { UpdateBudgetUseCase } from '@/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.js';
import { TokenUsageRecordFactory } from '@/tests/factories/tokenUsage.factory.js';
import { StubBudgetGateway } from '@/tests/stubs/budget.stub.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';

interface TestContext {
  app: FastifyInstance;
  budgetGateway: StubBudgetGateway;
  tokenUsageGateway: StubTokenUsageGateway;
  enforceBudget: EnforceBudgetUseCase;
  presenter: BudgetStatusPresenter;
  now: Date;
}

const LOCAL_PATH_A = '/tmp/acceptance-project-a';
const LOCAL_PATH_B = '/tmp/acceptance-project-b';
const PROJECT_PATH = 'group/project';
const PLATFORM = 'gitlab' as const;

async function buildContext(now: Date): Promise<TestContext> {
  const budgetGateway = new StubBudgetGateway();
  const tokenUsageGateway = new StubTokenUsageGateway();
  const getBudgetStatus = new GetBudgetStatusUseCase({
    budgetGateway,
    tokenUsageGateway,
  });
  const updateBudget = new UpdateBudgetUseCase({ budgetGateway });
  const enforceBudget = new EnforceBudgetUseCase({ getBudgetStatus });
  const presenter = new BudgetStatusPresenter();

  const app = Fastify();
  await app.register(budgetRoutes, {
    getBudgetStatus,
    updateBudget,
    budgetGateway,
    presenter,
    getRepositories: () => [
      {
        name: 'repo-a',
        platform: PLATFORM,
        remoteUrl: '',
        localPath: LOCAL_PATH_A,
        skill: 'review',
        enabled: true,
      },
      {
        name: 'repo-b',
        platform: PLATFORM,
        remoteUrl: '',
        localPath: LOCAL_PATH_B,
        skill: 'review',
        enabled: true,
      },
    ],
    now: () => now,
  });

  return { app, budgetGateway, tokenUsageGateway, enforceBudget, presenter, now };
}

describe('Acceptance — Spec #163: Token Budget Cap with Live Indicator', () => {
  describe('Scenario 2: Move the slider to 350', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await buildContext(new Date('2026-05-20T12:00:00Z'));
      await context.budgetGateway.save({ limitUsd: 200 });
    });

    it('updates the budget to 350 and persists it', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/budget',
        payload: { limitUsd: 350 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { success: boolean; limitUsd: number };
      expect(body.success).toBe(true);
      expect(body.limitUsd).toBe(350);

      const persisted = await context.budgetGateway.load();
      expect(persisted).toEqual({ limitUsd: 350 });

      await context.app.close();
    });
  });

  describe('Scenario 3: Try to push the budget above the ceiling', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await buildContext(new Date('2026-05-20T12:00:00Z'));
      await context.budgetGateway.save({ limitUsd: 200 });
    });

    it('rejects 750 with HTTP 400 and leaves the on-disk budget unchanged', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/budget',
        payload: { limitUsd: 750 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain('0');
      expect(body.error).toContain('600');

      const persisted = await context.budgetGateway.load();
      expect(persisted).toEqual({ limitUsd: 200 });

      await context.app.close();
    });
  });

  describe('Scenario 6: Block a fresh review when the GLOBAL sum across repos exceeds the cap', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await buildContext(new Date('2026-05-20T12:00:00Z'));
      await context.budgetGateway.save({ limitUsd: 200 });
      // Each repo individually is under the cap, but their SUM ($130 + $90 = $220) is over.
      // This is the meaningful R2 ("global cap") integration assertion.
      context.tokenUsageGateway.setRecordsForPath(LOCAL_PATH_A, [
        TokenUsageRecordFactory.create({
          recordedAt: '2026-05-10T00:00:00Z',
          localPath: LOCAL_PATH_A,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 130,
          },
        }),
      ]);
      context.tokenUsageGateway.setRecordsForPath(LOCAL_PATH_B, [
        TokenUsageRecordFactory.create({
          recordedAt: '2026-05-12T00:00:00Z',
          localPath: LOCAL_PATH_B,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 90,
          },
        }),
      ]);
    });

    it('returns accepted=false when the GLOBAL multi-repo sum crosses the cap', async () => {
      const decision = await context.enforceBudget.execute({
        localPaths: [LOCAL_PATH_A, LOCAL_PATH_B],
        now: context.now,
      });

      expect(decision.accepted).toBe(false);
      expect(decision.status.exceeded).toBe(true);
      expect(decision.status.limitUsd).toBe(200);
      expect(decision.status.consumedUsd).toBeCloseTo(220, 2);

      const viewModel = context.presenter.present(decision.status);
      expect(viewModel.exceeded).toBe(true);

      await context.app.close();
    });
  });

  describe('Scenario 8: Allow when the GLOBAL multi-repo sum stays under the cap', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await buildContext(new Date('2026-05-20T12:00:00Z'));
      await context.budgetGateway.save({ limitUsd: 200 });
      // Two repos summing to $189.99 — under the $200 cap.
      context.tokenUsageGateway.setRecordsForPath(LOCAL_PATH_A, [
        TokenUsageRecordFactory.create({
          recordedAt: '2026-05-10T00:00:00Z',
          localPath: LOCAL_PATH_A,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 100,
          },
        }),
      ]);
      context.tokenUsageGateway.setRecordsForPath(LOCAL_PATH_B, [
        TokenUsageRecordFactory.create({
          recordedAt: '2026-05-12T00:00:00Z',
          localPath: LOCAL_PATH_B,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 89.99,
          },
        }),
      ]);
    });

    it('returns accepted=true when the multi-repo sum stays under the limit', async () => {
      const decision = await context.enforceBudget.execute({
        localPaths: [LOCAL_PATH_A, LOCAL_PATH_B],
        now: context.now,
      });

      expect(decision.accepted).toBe(true);
      expect(decision.status.exceeded).toBe(false);
      expect(decision.status.consumedUsd).toBeCloseTo(189.99, 2);

      await context.app.close();
    });

    void PROJECT_PATH;
  });

  describe('Scenario 10: New calendar month resets the period', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await buildContext(new Date('2026-06-01T00:00:00Z'));
      await context.budgetGateway.save({ limitUsd: 200 });
      context.tokenUsageGateway.setRecordsForPath(LOCAL_PATH_A, [
        TokenUsageRecordFactory.create({
          recordedAt: '2026-05-31T23:00:00Z',
          localPath: LOCAL_PATH_A,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 200.5,
          },
        }),
      ]);
    });

    it('ignores prior-month consumption and accepts new reviews in June', async () => {
      const decision = await context.enforceBudget.execute({
        localPaths: [LOCAL_PATH_A, LOCAL_PATH_B],
        now: context.now,
      });

      expect(decision.accepted).toBe(true);
      expect(decision.status.consumedUsd).toBe(0);
      expect(decision.status.periodStart).toBe('2026-06-01T00:00:00.000Z');

      await context.app.close();
    });
  });
});
