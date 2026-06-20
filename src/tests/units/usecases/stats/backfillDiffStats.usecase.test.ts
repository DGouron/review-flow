import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { BackfillProgress } from '@/modules/statistics-insights/entities/backfill/backfillProgress.js';
import { backfillDiffStats } from '@/modules/statistics-insights/usecases/stats/backfillDiffStats.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { StubDiffStatsFetchGateway } from '@/tests/stubs/diffStatsFetch.stub.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

describe('backfillDiffStats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should forward the projectIdentifier to the gateway, not the projectPath', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 })];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    diffStatsFetchGateway.setResponse(10, { commitsCount: 3, additions: 100, deletions: 20 });

    const promise = backfillDiffStats(
      {
        projectPath: '/test/project',
        projectIdentifier: 'group/proj',
        batchSize: 10,
        batchDelayMs: 0,
      },
      { statsGateway, diffStatsFetchGateway, logger: { warn: vi.fn() } },
    );

    await vi.runAllTimersAsync();
    await promise;

    expect(diffStatsFetchGateway.lastProjectIdentifier).toBe('group/proj');
  });

  it('should fetch diff stats for reviews with undefined diffStats', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 })];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    diffStatsFetchGateway.setResponse(10, { commitsCount: 3, additions: 100, deletions: 20 });

    const promise = backfillDiffStats(
      {
        projectPath: '/test/project',
        projectIdentifier: 'group/proj',
        batchSize: 10,
        batchDelayMs: 0,
      },
      { statsGateway, diffStatsFetchGateway, logger: { warn: vi.fn() } },
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.completed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.status).toBe('completed');

    const saved = statsGateway.loadProjectStats('/test/project');
    expect(saved?.reviews[0].diffStats).toEqual({ commitsCount: 3, additions: 100, deletions: 20 });
  });

  it('should skip reviews that already have non-null diffStats', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

    const reviews = [
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 2, additions: 50, deletions: 10 },
        { id: 'r1', mrNumber: 10 },
      ),
    ];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    const promise = backfillDiffStats(
      {
        projectPath: '/test/project',
        projectIdentifier: 'group/proj',
        batchSize: 10,
        batchDelayMs: 0,
      },
      { statsGateway, diffStatsFetchGateway, logger: { warn: vi.fn() } },
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.total).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.status).toBe('completed');
    expect(diffStatsFetchGateway.fetchCallCount).toBe(0);
  });

  it('should retry reviews that have diffStats === null (poisoned by a failed fetch)', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10, diffStats: null })];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    diffStatsFetchGateway.setResponse(10, { commitsCount: 3, additions: 100, deletions: 20 });

    const promise = backfillDiffStats(
      {
        projectPath: '/test/project',
        projectIdentifier: 'group/proj',
        batchSize: 10,
        batchDelayMs: 0,
      },
      { statsGateway, diffStatsFetchGateway, logger: { warn: vi.fn() } },
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.total).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(0);
    expect(diffStatsFetchGateway.fetchCallCount).toBe(1);

    const saved = statsGateway.loadProjectStats('/test/project');
    expect(saved?.reviews[0].diffStats).toEqual({ commitsCount: 3, additions: 100, deletions: 20 });
  });

  it('should call onProgress after each review', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 }),
      ReviewStatsFactory.create({ id: 'r2', mrNumber: 11 }),
    ];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    diffStatsFetchGateway.setResponse(10, { commitsCount: 1, additions: 10, deletions: 5 });
    diffStatsFetchGateway.setResponse(11, { commitsCount: 2, additions: 20, deletions: 10 });

    const progressUpdates: BackfillProgress[] = [];

    const promise = backfillDiffStats(
      {
        projectPath: '/test/project',
        projectIdentifier: 'group/proj',
        batchSize: 10,
        batchDelayMs: 0,
        onProgress: (progress) => progressUpdates.push({ ...progress }),
      },
      { statsGateway, diffStatsFetchGateway, logger: { warn: vi.fn() } },
    );

    await vi.runAllTimersAsync();
    await promise;

    expect(progressUpdates.length).toBe(2);
    expect(progressUpdates[0].completed).toBe(1);
    expect(progressUpdates[1].completed).toBe(2);
  });

  it('should handle fetch failure gracefully', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();
    const logger = { warn: vi.fn() };

    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 })];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    diffStatsFetchGateway.setFailure(10);

    const promise = backfillDiffStats(
      {
        projectPath: '/test/project',
        projectIdentifier: 'group/proj',
        batchSize: 10,
        batchDelayMs: 0,
      },
      { statsGateway, diffStatsFetchGateway, logger },
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.failed).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.status).toBe('completed');
    expect(logger.warn).toHaveBeenCalled();

    const saved = statsGateway.loadProjectStats('/test/project');
    expect(saved?.reviews[0].diffStats).toBeNull();
  });

  it('should return correct final progress', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 }),
      ReviewStatsFactory.create({ id: 'r2', mrNumber: 11 }),
      ReviewStatsFactory.create({ id: 'r3', mrNumber: 12 }),
    ];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    diffStatsFetchGateway.setResponse(10, { commitsCount: 1, additions: 10, deletions: 5 });
    diffStatsFetchGateway.setFailure(11);
    diffStatsFetchGateway.setResponse(12, { commitsCount: 2, additions: 20, deletions: 10 });

    const promise = backfillDiffStats(
      {
        projectPath: '/test/project',
        projectIdentifier: 'group/proj',
        batchSize: 10,
        batchDelayMs: 0,
      },
      { statsGateway, diffStatsFetchGateway, logger: { warn: vi.fn() } },
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.total).toBe(3);
    expect(result.completed).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.status).toBe('completed');
  });

  it('should save updated stats after completion', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 })];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    diffStatsFetchGateway.setResponse(10, { commitsCount: 3, additions: 100, deletions: 20 });

    const promise = backfillDiffStats(
      {
        projectPath: '/test/project',
        projectIdentifier: 'group/proj',
        batchSize: 10,
        batchDelayMs: 0,
      },
      { statsGateway, diffStatsFetchGateway, logger: { warn: vi.fn() } },
    );

    await vi.runAllTimersAsync();
    await promise;

    const saved = statsGateway.loadProjectStats('/test/project');
    expect(saved).not.toBeNull();
    expect(saved?.reviews[0].diffStats).toEqual({ commitsCount: 3, additions: 100, deletions: 20 });
  });

  it('should return immediately when no reviews need backfill', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

    const reviews = [
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 10, deletions: 5 },
        { id: 'r1', mrNumber: 10 },
      ),
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 2, additions: 20, deletions: 10 },
        { id: 'r2', mrNumber: 11 },
      ),
    ];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    const result = await backfillDiffStats(
      {
        projectPath: '/test/project',
        projectIdentifier: 'group/proj',
        batchSize: 10,
        batchDelayMs: 0,
      },
      { statsGateway, diffStatsFetchGateway, logger: { warn: vi.fn() } },
    );

    expect(result.total).toBe(0);
    expect(result.status).toBe('completed');
    expect(diffStatsFetchGateway.fetchCallCount).toBe(0);
  });

  it('should process in batches with delay between them', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();

    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 }),
      ReviewStatsFactory.create({ id: 'r2', mrNumber: 11 }),
      ReviewStatsFactory.create({ id: 'r3', mrNumber: 12 }),
    ];
    const projectStats = ProjectStatsFactory.create({ reviews });
    statsGateway.saveProjectStats('/test/project', projectStats);

    diffStatsFetchGateway.setResponse(10, { commitsCount: 1, additions: 10, deletions: 5 });
    diffStatsFetchGateway.setResponse(11, { commitsCount: 2, additions: 20, deletions: 10 });
    diffStatsFetchGateway.setResponse(12, { commitsCount: 3, additions: 30, deletions: 15 });

    const progressUpdates: BackfillProgress[] = [];

    const promise = backfillDiffStats(
      {
        projectPath: '/test/project',
        projectIdentifier: 'group/proj',
        batchSize: 2,
        batchDelayMs: 1000,
        onProgress: (progress) => progressUpdates.push({ ...progress }),
      },
      { statsGateway, diffStatsFetchGateway, logger: { warn: vi.fn() } },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(progressUpdates.length).toBe(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(progressUpdates.length).toBe(3);

    const result = await promise;
    expect(result.total).toBe(3);
    expect(result.completed).toBe(3);
  });
});
