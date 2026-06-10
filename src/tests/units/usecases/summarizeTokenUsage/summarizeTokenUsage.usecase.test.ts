import { describe, it, expect, beforeEach } from 'vitest';

import { SummarizeTokenUsageUseCase } from '@/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.js';
import { TokenUsageRecordFactory } from '@/tests/factories/tokenUsage.factory.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';

describe('SummarizeTokenUsageUseCase', () => {
  let gateway: StubTokenUsageGateway;
  let useCase: SummarizeTokenUsageUseCase;

  beforeEach(() => {
    gateway = new StubTokenUsageGateway();
    useCase = new SummarizeTokenUsageUseCase(gateway);
  });

  it('should return zero summary when no records', async () => {
    const summary = await useCase.execute({ localPath: '/project' });

    expect(summary.recordCount).toBe(0);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.totalCacheRead).toBe(0);
    expect(summary.totalCacheCreation).toBe(0);
    expect(summary.byModel).toEqual({});
  });

  it('should aggregate all records', async () => {
    gateway.setRecords([
      TokenUsageRecordFactory.create({
        model: 'claude-opus-4-7',
        usage: {
          inputTokens: 1000,
          outputTokens: 200,
          cacheCreationInputTokens: 100,
          cacheReadInputTokens: 500,
          costUsd: 0.01,
        },
      }),
      TokenUsageRecordFactory.create({
        model: 'claude-opus-4-7',
        usage: {
          inputTokens: 2000,
          outputTokens: 300,
          cacheCreationInputTokens: 50,
          cacheReadInputTokens: 800,
          costUsd: 0.02,
        },
      }),
    ]);

    const summary = await useCase.execute({ localPath: '/project' });

    expect(summary.recordCount).toBe(2);
    expect(summary.totalInputTokens).toBe(3000);
    expect(summary.totalOutputTokens).toBe(500);
    expect(summary.totalCacheCreation).toBe(150);
    expect(summary.totalCacheRead).toBe(1300);
    expect(summary.totalCostUsd).toBeCloseTo(0.03);
  });

  it('should group by model', async () => {
    gateway.setRecords([
      TokenUsageRecordFactory.create({
        model: 'claude-opus-4-7',
        usage: {
          inputTokens: 100,
          outputTokens: 10,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.01,
        },
      }),
      TokenUsageRecordFactory.create({
        model: 'claude-sonnet-4-6',
        usage: {
          inputTokens: 200,
          outputTokens: 20,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.005,
        },
      }),
      TokenUsageRecordFactory.create({
        model: 'claude-opus-4-7',
        usage: {
          inputTokens: 50,
          outputTokens: 5,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.003,
        },
      }),
    ]);

    const summary = await useCase.execute({ localPath: '/project' });

    expect(summary.byModel['claude-opus-4-7'].count).toBe(2);
    expect(summary.byModel['claude-opus-4-7'].costUsd).toBeCloseTo(0.013);
    expect(summary.byModel['claude-sonnet-4-6'].count).toBe(1);
    expect(summary.byModel['claude-sonnet-4-6'].costUsd).toBeCloseTo(0.005);
  });

  it('should filter records by since date', async () => {
    gateway.setRecords([
      TokenUsageRecordFactory.create({
        recordedAt: '2025-01-01T00:00:00Z',
        usage: {
          inputTokens: 100,
          outputTokens: 10,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.01,
        },
      }),
      TokenUsageRecordFactory.create({
        recordedAt: '2025-06-01T00:00:00Z',
        usage: {
          inputTokens: 200,
          outputTokens: 20,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.02,
        },
      }),
      TokenUsageRecordFactory.create({
        recordedAt: '2025-12-01T00:00:00Z',
        usage: {
          inputTokens: 300,
          outputTokens: 30,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.03,
        },
      }),
    ]);

    const summary = await useCase.execute({ localPath: '/project', since: '2025-05-01T00:00:00Z' });

    expect(summary.recordCount).toBe(2);
    expect(summary.totalInputTokens).toBe(500);
  });
});
