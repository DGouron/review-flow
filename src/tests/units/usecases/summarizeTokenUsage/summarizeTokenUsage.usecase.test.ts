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

  it('splits the cost between reviews and follow-ups, an older record counting as a review', async () => {
    gateway.setRecords([
      TokenUsageRecordFactory.create({
        jobType: 'review',
        usage: { ...TokenUsageRecordFactory.create().usage, costUsd: 2 },
      }),
      TokenUsageRecordFactory.create({
        jobType: 'followup',
        usage: { ...TokenUsageRecordFactory.create().usage, costUsd: 0.5 },
      }),
      TokenUsageRecordFactory.create({
        usage: { ...TokenUsageRecordFactory.create().usage, costUsd: 1 },
      }),
    ]);

    const summary = await useCase.execute({ localPath: '/project' });

    expect(summary.byJobType).toEqual({
      review: { count: 2, costUsd: 3 },
      followup: { count: 1, costUsd: 0.5 },
    });
  });

  it('gives the median cost of a pull request over the period', async () => {
    const costOf = (mrNumber: number, costUsd: number, recordedAt = '2026-11-10T10:00:00.000Z') =>
      TokenUsageRecordFactory.create({
        mrNumber,
        recordedAt,
        usage: { ...TokenUsageRecordFactory.create().usage, costUsd },
      });
    gateway.setRecords([
      costOf(1, 1),
      costOf(2, 2),
      costOf(2, 2),
      costOf(3, 9),
      costOf(4, 100, '2026-10-30T10:00:00.000Z'),
    ]);

    const summary = await useCase.execute({
      localPath: '/project',
      since: '2026-11-01T00:00:00.000Z',
    });

    expect(summary.medianMergeRequestCostUsd).toBe(4);
  });
});
