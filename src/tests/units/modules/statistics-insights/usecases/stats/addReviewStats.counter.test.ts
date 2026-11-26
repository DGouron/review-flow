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

  it('adds the counts of each recorded review exactly once', () => {
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
    expect(stats?.totalBlocking).toBe(2);
    expect(stats?.totalWarnings).toBe(4);
  });

  it('counts a re-review of an already-recorded mrNumber once, not twice', () => {
    statsGateway.saveProjectStats(
      PROJECT,
      ProjectStatsFactory.create({
        totalReviews: 1,
        totalBlocking: 1,
        totalWarnings: 2,
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
    expect(stats?.totalBlocking).toBe(2);
    expect(stats?.totalWarnings).toBe(4);
  });

  it('keeps counting reviews past the 100-review trim window', () => {
    const reviews = Array.from({ length: 100 }, (_, index) =>
      ReviewStatsFactory.create({ id: `review-${index}`, mrNumber: index + 1, score: 7 }),
    );
    statsGateway.saveProjectStats(
      PROJECT,
      ProjectStatsFactory.create({
        totalReviews: 300,
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
    expect(stats?.totalReviews).toBe(301);
  });
});
