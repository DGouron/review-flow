import { describe, it, expect, beforeEach } from 'vitest';

import { parseReviewOutput } from '@/modules/statistics-insights/entities/stats/reviewOutput.parser.js';
import { AddReviewStatsUseCase } from '@/modules/statistics-insights/usecases/stats/addReviewStats.usecase.js';
import { DiffStatsFactory } from '@/tests/factories/diffStats.factory.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

const PROJECT = '/project';
const REVIEW_OUTPUT = '[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]';

describe('AddReviewStatsUseCase', () => {
  let statsGateway: InMemoryStatsGateway;
  let useCase: AddReviewStatsUseCase;

  beforeEach(() => {
    statsGateway = new InMemoryStatsGateway();
    useCase = new AddReviewStatsUseCase(statsGateway);
  });

  it('records a new review on an empty project', () => {
    const review = useCase.execute({
      projectPath: PROJECT,
      mrNumber: 42,
      duration: 60000,
      parsed: { score: 8, blocking: 1, warnings: 2, suggestions: 3, categoryBreakdown: null },
    });

    expect(review.mrNumber).toBe(42);
    expect(review.score).toBe(8);

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.totalReviews).toBe(1);
    expect(stats?.averageScore).toBe(8);
    expect(stats?.totalBlocking).toBe(1);
    expect(stats?.totalWarnings).toBe(2);
  });

  it('enforces the 100-review cap while still counting the total', () => {
    const reviews = Array.from({ length: 100 }, (_, index) =>
      ReviewStatsFactory.create({ id: `review-${index}`, mrNumber: index + 1, score: 7 }),
    );
    statsGateway.saveProjectStats(
      PROJECT,
      ProjectStatsFactory.create({
        totalReviews: 100,
        totalScoreSum: 700,
        scoredReviewCount: 100,
        averageScore: 7,
        reviews,
      }),
    );

    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 101,
      duration: 60000,
      parsed: parseReviewOutput(REVIEW_OUTPUT),
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.totalReviews).toBe(101);
    expect(stats?.reviews).toHaveLength(100);
    expect(stats?.reviews.at(-1)?.mrNumber).toBe(101);
  });

  it('excludes null scores from the average', () => {
    statsGateway.saveProjectStats(
      PROJECT,
      ProjectStatsFactory.create({
        totalReviews: 2,
        totalScoreSum: 14,
        scoredReviewCount: 2,
        averageScore: 7,
        reviews: [
          ReviewStatsFactory.create({ id: 'r1', score: 6 }),
          ReviewStatsFactory.create({ id: 'r2', score: 8 }),
        ],
      }),
    );

    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 3,
      duration: 60000,
      parsed: { score: null, blocking: 0, warnings: 0, suggestions: 0, categoryBreakdown: null },
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.averageScore).toBe(7);
    expect(stats?.totalReviews).toBe(3);
  });

  it('seeds an empty project from the gateway miss without throwing', () => {
    const review = useCase.execute({
      projectPath: PROJECT,
      mrNumber: 1,
      duration: 60000,
      parsed: { score: null, blocking: 0, warnings: 0, suggestions: 0, categoryBreakdown: null },
    });

    expect(review.score).toBeNull();

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.totalReviews).toBe(1);
    expect(stats?.averageScore).toBeNull();
    expect(stats?.scoredReviewCount).toBe(0);
  });

  it('aggregates diff stats and assignedBy when provided', () => {
    const review = useCase.execute({
      projectPath: PROJECT,
      mrNumber: 9,
      duration: 60000,
      parsed: { score: 9, blocking: 0, warnings: 0, suggestions: 0, categoryBreakdown: null },
      assignedBy: 'reviewer',
      diffStats: DiffStatsFactory.create({ additions: 80, deletions: 12 }),
    });

    expect(review.assignedBy).toBe('reviewer');
    expect(review.diffStats).toEqual({ commitsCount: 3, additions: 80, deletions: 12 });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.totalAdditions).toBe(80);
    expect(stats?.totalDeletions).toBe(12);
    expect(stats?.averageAdditions).toBe(80);
    expect(stats?.diffStatsReviewCount).toBe(1);
  });

  it('sums category breakdowns across reviews into the project aggregate', () => {
    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 1,
      duration: 60000,
      parsed: parseReviewOutput(
        '[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:score=8:categories=security=3]',
      ),
    });
    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 2,
      duration: 60000,
      parsed: parseReviewOutput(
        '[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:score=8:categories=security=2,logic=4]',
      ),
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.categoryBreakdown).toEqual({
      security: 5,
      logic: 4,
      performance: 0,
      typeSafety: 0,
      style: 0,
      dependencies: 0,
    });
  });

  it('accumulates totalBlocking and totalWarnings beyond the truncation window', () => {
    const reviews = Array.from({ length: 100 }, (_, index) =>
      ReviewStatsFactory.create({
        id: `review-${index}`,
        mrNumber: index + 1,
        blocking: 2,
        warnings: 3,
      }),
    );
    statsGateway.saveProjectStats(
      PROJECT,
      ProjectStatsFactory.create({
        totalReviews: 100,
        totalBlocking: 200,
        totalWarnings: 300,
        reviews,
      }),
    );

    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 101,
      duration: 60000,
      parsed: parseReviewOutput(REVIEW_OUTPUT),
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.totalBlocking).toBe(201);
    expect(stats?.totalWarnings).toBe(302);
  });

  it('initializes cumulative counters from the reviews array on first use', () => {
    statsGateway.saveProjectStats(
      PROJECT,
      ProjectStatsFactory.create({
        totalReviews: 2,
        totalBlocking: 1,
        totalWarnings: 3,
        averageScore: 7,
        reviews: [
          ReviewStatsFactory.create({ id: 'r1', score: 6, blocking: 1, warnings: 2 }),
          ReviewStatsFactory.create({ id: 'r2', score: 8, blocking: 0, warnings: 1 }),
        ],
      }),
    );

    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 3,
      duration: 60000,
      parsed: parseReviewOutput(REVIEW_OUTPUT),
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.totalReviews).toBe(3);
    expect(stats?.totalScoreSum).toBeCloseTo(6 + 8 + 7.5, 1);
    expect(stats?.scoredReviewCount).toBe(3);
  });

  it('stores the captured category breakdown on the review', () => {
    const review = useCase.execute({
      projectPath: PROJECT,
      mrNumber: 1,
      duration: 60000,
      parsed: parseReviewOutput(
        '[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:score=8:categories=logic=4]',
      ),
    });

    expect(review.categoryBreakdown).toEqual({
      security: 0,
      logic: 4,
      performance: 0,
      typeSafety: 0,
      style: 0,
      dependencies: 0,
    });
  });

  it('stores a null breakdown when the marker omits categories', () => {
    const review = useCase.execute({
      projectPath: PROJECT,
      mrNumber: 2,
      duration: 60000,
      parsed: parseReviewOutput('[REVIEW_STATS:blocking=1:warnings=0:suggestions=0:score=7]'),
    });

    expect(review.categoryBreakdown).toBeNull();
  });

  it('initializes the aggregate from legacy reviews lacking a breakdown', () => {
    const legacyReview = ReviewStatsFactory.create({ id: 'legacy', mrNumber: 9 });
    const seeded = ProjectStatsFactory.withReviews([legacyReview]);
    delete seeded.categoryBreakdown;
    statsGateway.saveProjectStats(PROJECT, seeded);

    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 10,
      duration: 60000,
      parsed: parseReviewOutput(
        '[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:score=8:categories=style=3]',
      ),
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.categoryBreakdown).toEqual({
      security: 0,
      logic: 0,
      performance: 0,
      typeSafety: 0,
      style: 3,
      dependencies: 0,
    });
  });

  it('keeps averageScore null when the new review carries no score', () => {
    const review = useCase.execute({
      projectPath: PROJECT,
      mrNumber: 7,
      duration: 60000,
      parsed: { score: null, blocking: 0, warnings: 0, suggestions: 0, categoryBreakdown: null },
    });

    expect(review.score).toBeNull();

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.averageScore).toBeNull();
    expect(stats?.scoredReviewCount).toBe(0);
  });

  it('leaves assignedBy undefined when not supplied', () => {
    const review = useCase.execute({
      projectPath: PROJECT,
      mrNumber: 12,
      duration: 60000,
      parsed: { score: null, blocking: 0, warnings: 0, suggestions: 0, categoryBreakdown: null },
    });

    expect(review.assignedBy).toBeUndefined();
  });

  it('defaults diffStats aggregates to null when none is supplied', () => {
    useCase.execute({
      projectPath: PROJECT,
      mrNumber: 11,
      duration: 60000,
      parsed: { score: null, blocking: 0, warnings: 0, suggestions: 0, categoryBreakdown: null },
    });

    const stats = statsGateway.loadProjectStats(PROJECT);
    expect(stats?.totalAdditions).toBe(0);
    expect(stats?.totalDeletions).toBe(0);
    expect(stats?.averageAdditions).toBeNull();
    expect(stats?.averageDeletions).toBeNull();
  });
});
