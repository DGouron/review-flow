import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach } from 'vitest';

import { budgetRoutes } from '@/modules/token-accounting/interface-adapters/controllers/http/budget.routes.js';
import { BudgetStatusPresenter } from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';
import { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';
import { UpdateBudgetUseCase } from '@/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.js';
import { TokenUsageRecordFactory } from '@/tests/factories/tokenUsage.factory.js';
import { StubBudgetGateway } from '@/tests/stubs/budget.stub.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';

interface Harness {
  app: FastifyInstance;
  budgetGateway: StubBudgetGateway;
  tokenUsageGateway: StubTokenUsageGateway;
}

async function buildApp(now: Date = new Date('2026-05-15T12:00:00Z')): Promise<Harness> {
  const budgetGateway = new StubBudgetGateway();
  const tokenUsageGateway = new StubTokenUsageGateway();
  const getBudgetStatus = new GetBudgetStatusUseCase({ budgetGateway, tokenUsageGateway });
  const updateBudget = new UpdateBudgetUseCase({ budgetGateway });
  const presenter = new BudgetStatusPresenter();

  const app = Fastify();
  await app.register(budgetRoutes, {
    getBudgetStatus,
    updateBudget,
    budgetGateway,
    presenter,
    getRepositories: () => [
      {
        name: 'repo',
        platform: 'gitlab',
        remoteUrl: '',
        localPath: '/project',
        skill: 'review',
        enabled: true,
      },
    ],
    now: () => now,
  });
  return { app, budgetGateway, tokenUsageGateway };
}

describe('budgetRoutes', () => {
  describe('GET /api/budget', () => {
    it('returns the default 200 limit when no config is persisted', async () => {
      const { app } = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/api/budget' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ limitUsd: 200 });

      await app.close();
    });

    it('returns the persisted limit when a config exists', async () => {
      const { app, budgetGateway } = await buildApp();
      await budgetGateway.save({ limitUsd: 350 });

      const response = await app.inject({ method: 'GET', url: '/api/budget' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ limitUsd: 350 });

      await app.close();
    });
  });

  describe('POST /api/budget', () => {
    let harness: Harness;

    beforeEach(async () => {
      harness = await buildApp();
      await harness.budgetGateway.save({ limitUsd: 200 });
    });

    it('updates the limit to 350 and returns success', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/budget',
        payload: { limitUsd: 350 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, limitUsd: 350 });
      const persisted = await harness.budgetGateway.load();
      expect(persisted).toEqual({ limitUsd: 350 });

      await harness.app.close();
    });

    it('rejects 750 with HTTP 400 and leaves the persisted config unchanged', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/budget',
        payload: { limitUsd: 750 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain('0');
      expect(body.error).toContain('600');

      const persisted = await harness.budgetGateway.load();
      expect(persisted).toEqual({ limitUsd: 200 });

      await harness.app.close();
    });

    it('rejects a non-numeric body with HTTP 400', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/budget',
        payload: { limitUsd: 'abc' },
      });

      expect(response.statusCode).toBe(400);

      await harness.app.close();
    });
  });

  describe('GET /api/budget/status', () => {
    it('returns the formatted budget status derived from token usage', async () => {
      const now = new Date('2026-05-15T12:00:00Z');
      const { app, budgetGateway, tokenUsageGateway } = await buildApp(now);
      await budgetGateway.save({ limitUsd: 200 });
      tokenUsageGateway.setRecords([
        TokenUsageRecordFactory.create({
          recordedAt: '2026-05-10T00:00:00Z',
          localPath: '/project',
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 48.5,
          },
        }),
      ]);

      const response = await app.inject({ method: 'GET', url: '/api/budget/status' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        limitUsdFormatted: string;
        consumedUsdFormatted: string;
        remainingUsdFormatted: string;
        percentUsedFormatted: string;
        gaugeWidthPercent: number;
        exceeded: boolean;
        periodStart: string;
      };
      expect(body.limitUsdFormatted).toBe('$200.00');
      expect(body.consumedUsdFormatted).toBe('$48.50');
      expect(body.remainingUsdFormatted).toBe('$151.50');
      expect(body.percentUsedFormatted).toBe('24.25%');
      expect(body.gaugeWidthPercent).toBe(24.25);
      expect(body.exceeded).toBe(false);
      expect(body.periodStart).toBe('2026-05-01T00:00:00.000Z');

      await app.close();
    });
  });
});
