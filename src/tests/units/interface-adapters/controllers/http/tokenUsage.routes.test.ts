import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';

import type { TokenUsageGateway } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.js';
import type { TokenUsageRecord } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';
import { tokenUsageRoutes } from '@/modules/token-accounting/interface-adapters/controllers/http/tokenUsage.routes.js';
import { TokenUsageSummaryPresenter } from '@/modules/token-accounting/interface-adapters/presenters/tokenUsageSummary.presenter.js';
import { SummarizeTokenUsageUseCase } from '@/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.js';

class StubTokenUsageGateway implements TokenUsageGateway {
  constructor(private readonly records: TokenUsageRecord[]) {}
  async record(): Promise<void> {
    // no-op for read tests
  }
  async loadAll(): Promise<TokenUsageRecord[]> {
    return this.records;
  }
}

function makeRecord(overrides: Partial<TokenUsageRecord> = {}): TokenUsageRecord {
  return {
    jobId: 'job-1',
    mrNumber: 1,
    platform: 'gitlab',
    projectPath: 'group/project',
    model: 'claude-sonnet-4-6',
    recordedAt: '2026-05-15T12:00:00.000Z',
    localPath: '/path',
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0.1,
    },
    ...overrides,
  };
}

async function buildAppWith(records: TokenUsageRecord[]) {
  const app = Fastify();
  const gateway = new StubTokenUsageGateway(records);
  await app.register(tokenUsageRoutes, {
    summarizeTokenUsage: new SummarizeTokenUsageUseCase(gateway),
    presenter: new TokenUsageSummaryPresenter(),
  });
  return app;
}

describe('tokenUsageRoutes', () => {
  describe('GET /api/token-usage/summary', () => {
    it('returns 200 with the presented view model for a project with records', async () => {
      const app = await buildAppWith([
        makeRecord({ model: 'claude-opus-4-7', usage: { ...makeRecord().usage, costUsd: 0.3 } }),
        makeRecord({ model: 'claude-opus-4-7', usage: { ...makeRecord().usage, costUsd: 0.3 } }),
        makeRecord({ model: 'claude-sonnet-4-6', usage: { ...makeRecord().usage, costUsd: 0.1 } }),
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/token-usage/summary?projectPath=/path',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        totalCostUsd: string;
        recordCount: number;
        models: { name: string; costUsd: string }[];
        isEmpty: boolean;
      };
      expect(body.totalCostUsd).toBe('$0.70');
      expect(body.recordCount).toBe(3);
      expect(body.isEmpty).toBe(false);
      expect(body.models[0].name).toBe('claude-opus-4-7');
      expect(body.models[0].costUsd).toBe('$0.60');

      await app.close();
    });

    it('returns 200 with an empty view model for a project with no records', async () => {
      const app = await buildAppWith([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/token-usage/summary?projectPath=/path',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { isEmpty: boolean; recordCount: number };
      expect(body.isEmpty).toBe(true);
      expect(body.recordCount).toBe(0);

      await app.close();
    });

    it('filters records by the since query parameter', async () => {
      const app = await buildAppWith([
        makeRecord({
          recordedAt: '2026-05-01T00:00:00.000Z',
          usage: { ...makeRecord().usage, costUsd: 0.5 },
        }),
        makeRecord({
          recordedAt: '2026-05-15T00:00:00.000Z',
          usage: { ...makeRecord().usage, costUsd: 0.1 },
        }),
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/token-usage/summary?projectPath=/path&since=2026-05-10',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { totalCostUsd: string; recordCount: number };
      expect(body.recordCount).toBe(1);
      expect(body.totalCostUsd).toBe('$0.10');

      await app.close();
    });

    it('returns 400 when projectPath is missing', async () => {
      const app = await buildAppWith([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/token-usage/summary',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { error: string };
      expect(body.error).toContain('projectPath');

      await app.close();
    });
  });
});
