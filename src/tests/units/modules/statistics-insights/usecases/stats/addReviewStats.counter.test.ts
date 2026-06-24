import { describe, it, expect, beforeEach } from 'vitest';

import { parseReviewOutput } from '@/modules/statistics-insights/entities/stats/reviewOutput.parser.js';
import { AddReviewStatsUseCase } from '@/modules/statistics-insights/usecases/stats/addReviewStats.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

const PROJECT = '/project';
const SCORED_REVIEW = '[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]';

describe('AddReviewStatsUseCase cumulative counters', () => {
  let statsGateway: InMemoryStatsGateway;
  let useCase: AddReviewStatsUseCase;

  beforeEach(() => {
    statsGateway = new InMemoryStatsGateway();
    useCase = new AddReviewStatsUseCase(statsGateway);
  });

  it('moves scoredReviewCount by exactly one per recorded review, never double-counting', () => {
    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 1,
      duration: 60000,
      parsed: parseReviewOutput(SCORED_REVIEW),
    });
    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 2,
      duration: 60000,
      parsed: parseReviewOutput(SCORED_REVIEW),
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.scoredReviewCount).toBe(2);
    expect(stats?.totalScoreSum).toBeCloseTo(15, 1);
    expect(stats?.totalBlocking).toBe(2);
    expect(stats?.totalWarnings).toBe(4);
  });

  it('counts a re-review of an already-recorded mrNumber once, not twice', () => {
    statsGateway.saveProjectStats(
      PROJECT,
      ProjectStatsFactory.create({
        totalReviews: 1,
        totalScoreSum: 6,
        scoredReviewCount: 1,
        totalBlocking: 1,
        totalWarnings: 2,
        averageScore: 6,
        reviews: [ReviewStatsFactory.create({ id: 'r1', mrNumber: 7, score: 6 })],
      }),
    );

    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 7,
      duration: 60000,
      parsed: parseReviewOutput(SCORED_REVIEW),
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.scoredReviewCount).toBe(2);
    expect(stats?.totalScoreSum).toBeCloseTo(13.5, 1);
    expect(stats?.totalBlocking).toBe(2);
    expect(stats?.totalWarnings).toBe(4);
  });

  it('skips the counter when the new review carries a null score', () => {
    statsGateway.saveProjectStats(
      PROJECT,
      ProjectStatsFactory.create({
        totalReviews: 1,
        totalScoreSum: 8,
        scoredReviewCount: 1,
        averageScore: 8,
        reviews: [ReviewStatsFactory.create({ id: 'r1', mrNumber: 1, score: 8 })],
      }),
    );

    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 2,
      duration: 60000,
      parsed: { score: null, blocking: 0, warnings: 0, suggestions: 0, categoryBreakdown: null },
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.scoredReviewCount).toBe(1);
    expect(stats?.totalScoreSum).toBe(8);
  });

  it('accumulates scoredReviewCount monotonically past the 100-review trim window', () => {
    const reviews = Array.from({ length: 100 }, (_, index) =>
      ReviewStatsFactory.create({ id: `review-${index}`, mrNumber: index + 1, score: 7 }),
    );
    statsGateway.saveProjectStats(
      PROJECT,
      ProjectStatsFactory.create({
        totalReviews: 300,
        totalScoreSum: 2100,
        scoredReviewCount: 300,
        averageScore: 7,
        reviews,
      }),
    );

    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 301,
      duration: 60000,
      parsed: parseReviewOutput(SCORED_REVIEW),
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.reviews).toHaveLength(100);
    expect(stats?.scoredReviewCount).toBe(301);
    expect(stats?.totalReviews).toBe(301);
  });
});
