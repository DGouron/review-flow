import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  addReviewStats,
  loadProjectStats,
  saveProjectStats,
} from '@/modules/statistics-insights/services/statsService.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const REVIEW_OUTPUT = '[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]';

describe('addReviewStats incremental aggregation', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = join(tmpdir(), `reviewflow-test-${Date.now()}`);
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('should preserve totalReviews beyond 100 after truncation', () => {
    const reviews = Array.from({ length: 100 }, (_, index) =>
      ReviewStatsFactory.create({
        id: `review-${index}`,
        mrNumber: index + 1,
        score: 7,
        blocking: 1,
        warnings: 1,
      }),
    );

    const stats = ProjectStatsFactory.create({
      totalReviews: 100,
      totalDuration: 100 * 60000,
      totalBlocking: 100,
      totalWarnings: 100,
      averageScore: 7,
      averageDuration: 60000,
      totalScoreSum: 700,
      scoredReviewCount: 100,
      reviews,
    });
    saveProjectStats(projectPath, stats);

    addReviewStats(projectPath, 101, 60000, REVIEW_OUTPUT);

    const updated = loadProjectStats(projectPath);
    expect(updated.totalReviews).toBe(101);
    expect(updated.reviews.length).toBeLessThanOrEqual(100);
  });

  it('should accumulate totalBlocking and totalWarnings beyond truncation', () => {
    const reviews = Array.from({ length: 100 }, (_, index) =>
      ReviewStatsFactory.create({
        id: `review-${index}`,
        mrNumber: index + 1,
        blocking: 2,
        warnings: 3,
      }),
    );

    const stats = ProjectStatsFactory.create({
      totalReviews: 100,
      totalDuration: 100 * 60000,
      totalBlocking: 200,
      totalWarnings: 300,
      reviews,
    });
    saveProjectStats(projectPath, stats);

    addReviewStats(projectPath, 101, 60000, REVIEW_OUTPUT);

    const updated = loadProjectStats(projectPath);
    expect(updated.totalBlocking).toBe(201);
    expect(updated.totalWarnings).toBe(302);
  });

  it('should compute correct averageScore from cumulative counters', () => {
    const reviews = Array.from({ length: 100 }, (_, index) =>
      ReviewStatsFactory.create({
        id: `review-${index}`,
        mrNumber: index + 1,
        score: 8,
      }),
    );

    const stats = ProjectStatsFactory.create({
      totalReviews: 100,
      totalScoreSum: 800,
      scoredReviewCount: 100,
      averageScore: 8,
      reviews,
    });
    saveProjectStats(projectPath, stats);

    addReviewStats(projectPath, 101, 60000, REVIEW_OUTPUT);

    const updated = loadProjectStats(projectPath);
    expect(updated.scoredReviewCount).toBe(101);
    expect(updated.averageScore).toBeCloseTo((800 + 7.5) / 101, 2);
  });

  it('should initialize cumulative counters from reviews array on first use', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', score: 6, blocking: 1, warnings: 2 }),
      ReviewStatsFactory.create({ id: 'r2', score: 8, blocking: 0, warnings: 1 }),
    ];

    const stats = ProjectStatsFactory.create({
      totalReviews: 2,
      totalBlocking: 1,
      totalWarnings: 3,
      averageScore: 7,
      reviews,
    });
    saveProjectStats(projectPath, stats);

    addReviewStats(projectPath, 3, 60000, REVIEW_OUTPUT);

    const updated = loadProjectStats(projectPath);
    expect(updated.totalReviews).toBe(3);
    expect(updated.totalScoreSum).toBeCloseTo(6 + 8 + 7.5, 1);
    expect(updated.scoredReviewCount).toBe(3);
  });
});
