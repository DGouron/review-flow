import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  addReviewStats,
  loadProjectStats,
  parseReviewOutput,
  saveProjectStats,
} from '@/modules/statistics-insights/services/statsService.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const marker = (categories: string): string =>
  `[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:score=8:categories=${categories}]`;

describe('parseReviewOutput category segment', () => {
  it('returns a normalized breakdown from the categories segment', () => {
    const parsed = parseReviewOutput(marker('security=3,logic=5,performance=1'));

    expect(parsed.categoryBreakdown).toEqual({
      security: 3,
      logic: 5,
      performance: 1,
      typeSafety: 0,
      style: 0,
      dependencies: 0,
    });
  });

  it('drops unknown categories from the segment', () => {
    const parsed = parseReviewOutput(marker('security=2,cosmic=9'));

    expect(parsed.categoryBreakdown).toEqual({
      security: 2,
      logic: 0,
      performance: 0,
      typeSafety: 0,
      style: 0,
      dependencies: 0,
    });
  });

  it('returns null breakdown when the marker has no categories segment', () => {
    const parsed = parseReviewOutput('[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7]');

    expect(parsed.categoryBreakdown).toBeNull();
  });
});

describe('addReviewStats category capture and aggregation', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = join(tmpdir(), `reviewflow-category-${Date.now()}-${Math.random()}`);
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('stores the captured breakdown on the review', () => {
    const review = addReviewStats(projectPath, 1, 60000, marker('logic=4'));

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
    const review = addReviewStats(
      projectPath,
      2,
      60000,
      '[REVIEW_STATS:blocking=1:warnings=0:suggestions=0:score=7]',
    );

    expect(review.categoryBreakdown).toBeNull();
  });

  it('sums the breakdown across reviews into the project aggregate', () => {
    addReviewStats(projectPath, 1, 60000, marker('security=3'));
    addReviewStats(projectPath, 2, 60000, marker('security=2,logic=4'));

    const stats = loadProjectStats(projectPath);

    expect(stats.categoryBreakdown).toEqual({
      security: 5,
      logic: 4,
      performance: 0,
      typeSafety: 0,
      style: 0,
      dependencies: 0,
    });
  });

  it('treats a review without a breakdown as a zero contribution', () => {
    addReviewStats(projectPath, 1, 60000, marker('logic=2'));
    addReviewStats(projectPath, 2, 60000, '[REVIEW_STATS:blocking=0:warnings=0:suggestions=0]');

    const stats = loadProjectStats(projectPath);

    expect(stats.categoryBreakdown).toEqual({
      security: 0,
      logic: 2,
      performance: 0,
      typeSafety: 0,
      style: 0,
      dependencies: 0,
    });
  });

  it('initializes the aggregate from legacy reviews lacking a breakdown', () => {
    const legacyReview = ReviewStatsFactory.create({ id: 'legacy', mrNumber: 9 });
    const seeded = ProjectStatsFactory.withReviews([legacyReview]);
    delete seeded.categoryBreakdown;
    saveProjectStats(projectPath, seeded);

    addReviewStats(projectPath, 10, 60000, marker('style=3'));

    const stats = loadProjectStats(projectPath);

    expect(stats.categoryBreakdown).toEqual({
      security: 0,
      logic: 0,
      performance: 0,
      typeSafety: 0,
      style: 3,
      dependencies: 0,
    });
  });
});
