import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { BackfillProgress } from '@/modules/statistics-insights/entities/backfill/backfillProgress.js';
import { recalculateWithBackfill } from '@/modules/statistics-insights/usecases/stats/recalculateWithBackfill.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { StubDiffStatsFetchGateway } from '@/tests/stubs/diffStatsFetch.stub.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

describe('recalculateWithBackfill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should recalculate stats without backfill when shouldBackfill is false', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', mrNumber: 1, score: 6 }),
      ReviewStatsFactory.create({ id: 'r2', mrNumber: 2, score: 8 }),
    ];
    statsGateway.saveProjectStats(
      '/test/project',
      ProjectStatsFactory.create({
        reviews,
        averageScore: 0,
      }),
    );

    const progressUpdates: BackfillProgress[] = [];

    const promise = recalculateWithBackfill(
      {
        projectPath: '/test/project',
        shouldBackfill: false,
        platform: 'gitlab',
        projectIdentifier: 'group/proj',
      },
      {
        statsGateway,
        diffStatsFetchGateways: null,
        onProgress: (progress) => progressUpdates.push({ ...progress }),
        logger: { warn: vi.fn(), error: vi.fn() },
      },
    );

    await vi.runAllTimersAsync();
    await promise;

    const saved = statsGateway.loadProjectStats('/test/project');
    expect(saved?.averageScore).toBe(7);
    expect(progressUpdates.at(-1)?.status).toBe('completed');
  });

  it('should run backfill before recalculation when shouldBackfill is true', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();
    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 })];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.create({ reviews }));
    diffStatsFetchGateway.setResponse(10, { commitsCount: 3, additions: 100, deletions: 20 });

    const progressUpdates: BackfillProgress[] = [];

    const promise = recalculateWithBackfill(
      {
        projectPath: '/test/project',
        shouldBackfill: true,
        platform: 'gitlab',
        projectIdentifier: 'group/proj',
      },
      {
        statsGateway,
        diffStatsFetchGateways: { gitlab: diffStatsFetchGateway, github: diffStatsFetchGateway },
        onProgress: (progress) => progressUpdates.push({ ...progress }),
        logger: { warn: vi.fn(), error: vi.fn() },
      },
    );

    await vi.runAllTimersAsync();
    await promise;

    const saved = statsGateway.loadProjectStats('/test/project');
    expect(saved?.reviews[0].diffStats).toEqual({ commitsCount: 3, additions: 100, deletions: 20 });
    expect(diffStatsFetchGateway.lastProjectIdentifier).toBe('group/proj');
    expect(progressUpdates.at(-1)?.status).toBe('completed');
  });

  it('should skip backfill when platform is null', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();
    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 })];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.create({ reviews }));

    const progressUpdates: BackfillProgress[] = [];

    const promise = recalculateWithBackfill(
      {
        projectPath: '/test/project',
        shouldBackfill: true,
        platform: null,
        projectIdentifier: null,
      },
      {
        statsGateway,
        diffStatsFetchGateways: { gitlab: diffStatsFetchGateway, github: diffStatsFetchGateway },
        onProgress: (progress) => progressUpdates.push({ ...progress }),
        logger: { warn: vi.fn(), error: vi.fn() },
      },
    );

    await vi.runAllTimersAsync();
    await promise;

    expect(diffStatsFetchGateway.fetchCallCount).toBe(0);
    expect(progressUpdates.at(-1)?.status).toBe('completed');
  });

  it('should use github gateway when platform is github', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const gitlabGateway = new StubDiffStatsFetchGateway();
    const githubGateway = new StubDiffStatsFetchGateway();
    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 })];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.create({ reviews }));
    githubGateway.setResponse(10, { commitsCount: 5, additions: 200, deletions: 50 });

    const promise = recalculateWithBackfill(
      {
        projectPath: '/test/project',
        shouldBackfill: true,
        platform: 'github',
        projectIdentifier: 'owner/repo',
      },
      {
        statsGateway,
        diffStatsFetchGateways: { gitlab: gitlabGateway, github: githubGateway },
        onProgress: vi.fn(),
        logger: { warn: vi.fn(), error: vi.fn() },
      },
    );

    await vi.runAllTimersAsync();
    await promise;

    expect(githubGateway.fetchCallCount).toBe(1);
    expect(githubGateway.lastProjectIdentifier).toBe('owner/repo');
    expect(gitlabGateway.fetchCallCount).toBe(0);
  });

  it('should log error and not throw when recalculation fails', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const diffStatsFetchGateway = new StubDiffStatsFetchGateway();
    const errorLogger = vi.fn();

    diffStatsFetchGateway.setFailure(10);

    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 10 })];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.create({ reviews }));

    const promise = recalculateWithBackfill(
      {
        projectPath: '/test/project',
        shouldBackfill: true,
        platform: 'gitlab',
        projectIdentifier: 'group/proj',
      },
      {
        statsGateway,
        diffStatsFetchGateways: { gitlab: diffStatsFetchGateway, github: diffStatsFetchGateway },
        onProgress: vi.fn(),
        logger: { warn: vi.fn(), error: errorLogger },
      },
    );

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });

  it('should broadcast completion progress after recalculation', async () => {
    const statsGateway = new InMemoryStatsGateway();
    const reviews = [ReviewStatsFactory.create({ id: 'r1', mrNumber: 1, score: 9 })];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.create({ reviews }));

    const progressUpdates: BackfillProgress[] = [];

    const promise = recalculateWithBackfill(
      {
        projectPath: '/test/project',
        shouldBackfill: false,
        platform: null,
        projectIdentifier: null,
      },
      {
        statsGateway,
        diffStatsFetchGateways: null,
        onProgress: (progress) => progressUpdates.push({ ...progress }),
        logger: { warn: vi.fn(), error: vi.fn() },
      },
    );

    await vi.runAllTimersAsync();
    await promise;

    const lastProgress = progressUpdates.at(-1);
    expect(lastProgress).toEqual({
      total: 0,
      completed: 0,
      failed: 0,
      status: 'completed',
    });
  });
});
