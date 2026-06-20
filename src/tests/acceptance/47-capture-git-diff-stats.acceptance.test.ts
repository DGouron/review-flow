/**
 * SPEC-47 — Capture Git Diff Stats (Commits, Additions, Deletions)
 *
 * Outer-loop acceptance test (SDD): exercises the production
 * fetchDiffStatsSafely helper + the stats service + the tracking use case.
 * The wiring inside claudeInvoker.ts is exercised by its own unit tests.
 *
 * Scenarios from docs/specs/47-capture-git-diff-stats.md:
 *   1. Successful diff stats capture on GitHub review (nominal)
 *   2. Successful diff stats capture on GitLab review (nominal)
 *   3. Diff stats fetch failure does not block the review
 *   4. Backward compatibility — old reviews without diff stats
 *   5. Aggregated diff stats in project stats
 *   6. Followup reviews also capture diff stats
 *   7. Zero-diff merge request
 */

import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pino, type Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type {
  ProjectStats,
  ReviewStats,
} from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { parseReviewOutput } from '@/modules/statistics-insights/entities/stats/reviewOutput.parser.js';
import { FileSystemStatsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.js';
import { StatsSummaryPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/statsSummary.presenter.js';
import { fetchDiffStatsSafely } from '@/modules/statistics-insights/services/fetchDiffStatsSafely.js';
import { AddReviewStatsUseCase } from '@/modules/statistics-insights/usecases/stats/addReviewStats.usecase.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { DiffStatsFactory } from '@/tests/factories/diffStats.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { StubDiffStatsFetchGateway } from '@/tests/stubs/diffStatsFetch.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const REVIEW_OUTPUT = '[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]';

const fileSystemStatsGateway = new FileSystemStatsGateway();
const statsSummaryPresenter = new StatsSummaryPresenter();

const addReviewStats = (
  projectPath: string,
  mrNumber: number,
  duration: number,
  stdout: string,
  assignedBy?: string,
  diffStats?: DiffStats | null,
): ReviewStats =>
  new AddReviewStatsUseCase(fileSystemStatsGateway).execute({
    projectPath,
    mrNumber,
    duration,
    parsed: parseReviewOutput(stdout),
    assignedBy,
    diffStats,
  });

const loadProjectStats = (projectPath: string): ProjectStats => {
  const stats = fileSystemStatsGateway.loadProjectStats(projectPath);
  if (stats === null) throw new Error(`No stats found for ${projectPath}`);
  return stats;
};

const getStatsSummary = (stats: ProjectStats) => statsSummaryPresenter.present(stats);

let projectCounter = 0;

describe('Acceptance — SPEC-47: Capture git diff stats', () => {
  let projectPath: string;
  let logger: Logger;

  beforeEach(() => {
    projectCounter += 1;
    projectPath = join(tmpdir(), `reviewflow-spec-47-${projectCounter}`);
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
    logger = pino({ level: 'silent' });
  });

  afterEach(() => {
    if (existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  describe('Scenario 1: Successful diff stats capture on GitHub review (nominal)', () => {
    it('records diff stats on both ReviewStats and ReviewEvent', () => {
      const diffStatsGateway = new StubDiffStatsFetchGateway();
      diffStatsGateway.setResponse(42, { commitsCount: 3, additions: 150, deletions: 30 });

      const fetched = fetchDiffStatsSafely(diffStatsGateway, projectPath, 42, logger);
      const reviewStats = addReviewStats(
        projectPath,
        42,
        60_000,
        REVIEW_OUTPUT,
        'reviewer',
        fetched,
      );

      expect(reviewStats.diffStats).toEqual({
        commitsCount: 3,
        additions: 150,
        deletions: 30,
      });

      const tracking = new InMemoryReviewRequestTrackingGateway();
      tracking.create(
        projectPath,
        TrackedMrFactory.create({ id: 'gh-42', mrNumber: 42, platform: 'github' }),
      );
      const recordCompletion = new RecordReviewCompletionUseCase(tracking);

      const result = recordCompletion.execute({
        projectPath,
        mrId: 'gh-42',
        reviewData: {
          type: 'review',
          durationMs: 60_000,
          score: 7.5,
          blocking: 1,
          warnings: 2,
          diffStats: fetched,
        },
      });

      expect(result?.reviews[0]?.diffStats).toEqual({
        commitsCount: 3,
        additions: 150,
        deletions: 30,
      });
    });
  });

  describe('Scenario 2: Successful diff stats capture on GitLab review (nominal)', () => {
    it('records diff stats matching the fetched values', () => {
      const diffStatsGateway = new StubDiffStatsFetchGateway();
      diffStatsGateway.setResponse(42, { commitsCount: 5, additions: 200, deletions: 45 });

      const fetched = fetchDiffStatsSafely(diffStatsGateway, projectPath, 42, logger);
      const reviewStats = addReviewStats(
        projectPath,
        42,
        90_000,
        REVIEW_OUTPUT,
        'reviewer',
        fetched,
      );

      expect(reviewStats.diffStats).toEqual({
        commitsCount: 5,
        additions: 200,
        deletions: 45,
      });
    });
  });

  describe('Scenario 3: Diff stats fetch failure does not block the review', () => {
    it('persists ReviewStats with diffStats=null, does not throw, and logs a warning', () => {
      const diffStatsGateway = new StubDiffStatsFetchGateway();
      diffStatsGateway.setFailure(42);
      const warnSpy = vi.spyOn(logger, 'warn');

      const fetched = fetchDiffStatsSafely(diffStatsGateway, projectPath, 42, logger);
      expect(fetched).toBeNull();
      expect(warnSpy).toHaveBeenCalledOnce();

      const reviewStats = addReviewStats(
        projectPath,
        42,
        60_000,
        REVIEW_OUTPUT,
        'reviewer',
        fetched,
      );

      expect(reviewStats.diffStats).toBeNull();
      expect(reviewStats.mrNumber).toBe(42);
      expect(reviewStats.score).toBe(7.5);
      expect(reviewStats.blocking).toBe(1);
      expect(reviewStats.warnings).toBe(2);
    });
  });

  describe('Scenario 4: Backward compatibility — old reviews without diffStats', () => {
    it('loads legacy stats.json without diffStats fields without crashing', () => {
      const legacyStats = {
        totalReviews: 2,
        totalDuration: 120_000,
        averageScore: 7,
        averageDuration: 60_000,
        totalBlocking: 1,
        totalWarnings: 3,
        reviews: [
          {
            id: 'legacy-1',
            timestamp: '2024-01-01T10:00:00Z',
            mrNumber: 1,
            duration: 60_000,
            score: 7,
            blocking: 0,
            warnings: 1,
          },
          {
            id: 'legacy-2',
            timestamp: '2024-01-02T10:00:00Z',
            mrNumber: 2,
            duration: 60_000,
            score: 7,
            blocking: 1,
            warnings: 2,
          },
        ],
        lastUpdated: '2024-01-02T10:00:00Z',
      };

      writeFileSync(
        join(projectPath, '.claude', 'reviews', 'stats.json'),
        JSON.stringify(legacyStats, null, 2),
        'utf-8',
      );

      const loaded = loadProjectStats(projectPath);
      expect(loaded.totalReviews).toBe(2);
      expect(loaded.reviews).toHaveLength(2);
      expect(loaded.reviews[0]?.diffStats).toBeUndefined();

      const newReview = addReviewStats(projectPath, 3, 60_000, REVIEW_OUTPUT, 'reviewer', null);
      expect(newReview.diffStats).toBeNull();

      const after = loadProjectStats(projectPath);
      expect(after.totalReviews).toBe(3);
      expect(after.averageAdditions ?? null).toBeNull();
      expect(after.averageDeletions ?? null).toBeNull();
    });
  });

  describe('Scenario 5: Aggregated diff stats in project stats', () => {
    it('averages exclude null entries and totals reflect only diff-bearing reviews', () => {
      addReviewStats(
        projectPath,
        1,
        60_000,
        REVIEW_OUTPUT,
        'reviewer',
        DiffStatsFactory.create({ commitsCount: 2, additions: 100, deletions: 20 }),
      );
      addReviewStats(
        projectPath,
        2,
        60_000,
        REVIEW_OUTPUT,
        'reviewer',
        DiffStatsFactory.create({ commitsCount: 1, additions: 50, deletions: 10 }),
      );
      addReviewStats(projectPath, 3, 60_000, REVIEW_OUTPUT, 'reviewer', null);

      const stats = loadProjectStats(projectPath);

      expect(stats.totalAdditions).toBe(150);
      expect(stats.totalDeletions).toBe(30);
      expect(stats.averageAdditions).toBe(75);
      expect(stats.averageDeletions).toBe(15);
      expect(stats.diffStatsReviewCount).toBe(2);

      const summary = getStatsSummary(stats);
      expect(summary.totalAdditions).toBe(150);
      expect(summary.totalDeletions).toBe(30);
      expect(summary.totalLinesReviewed).toBe(180);
      expect(summary.averageAdditions).toBe('75.0');
      expect(summary.averageDeletions).toBe('15.0');
    });
  });

  describe('Scenario 6: Followup reviews also capture diff stats', () => {
    it('records diffStats on both initial review and followup ReviewEvent', () => {
      const tracking = new InMemoryReviewRequestTrackingGateway();
      tracking.create(projectPath, TrackedMrFactory.create({ id: 'mr-42', mrNumber: 42 }));
      const recordCompletion = new RecordReviewCompletionUseCase(tracking);

      recordCompletion.execute({
        projectPath,
        mrId: 'mr-42',
        reviewData: {
          type: 'review',
          durationMs: 60_000,
          score: 8,
          blocking: 0,
          warnings: 1,
          diffStats: DiffStatsFactory.create({ commitsCount: 2, additions: 100, deletions: 20 }),
        },
      });

      const after = recordCompletion.execute({
        projectPath,
        mrId: 'mr-42',
        reviewData: {
          type: 'followup',
          durationMs: 30_000,
          score: 9,
          blocking: 0,
          warnings: 0,
          diffStats: DiffStatsFactory.create({ commitsCount: 4, additions: 180, deletions: 35 }),
        },
      });

      expect(after?.reviews).toHaveLength(2);
      const [first, second] = after?.reviews ?? [];
      expect(first?.type).toBe('review');
      expect(first?.diffStats).toEqual({ commitsCount: 2, additions: 100, deletions: 20 });
      expect(second?.type).toBe('followup');
      expect(second?.diffStats).toEqual({ commitsCount: 4, additions: 180, deletions: 35 });
    });
  });

  describe('Scenario 7: Zero-diff merge request', () => {
    it('persists zero values as-is (not coerced to null)', () => {
      const zeroDiff: DiffStats = { commitsCount: 1, additions: 0, deletions: 0 };
      const reviewStats = addReviewStats(
        projectPath,
        42,
        60_000,
        REVIEW_OUTPUT,
        'reviewer',
        zeroDiff,
      );

      expect(reviewStats.diffStats).toEqual({ commitsCount: 1, additions: 0, deletions: 0 });

      const stats = loadProjectStats(projectPath);
      expect(stats.diffStatsReviewCount).toBe(1);
      expect(stats.totalAdditions).toBe(0);
      expect(stats.totalDeletions).toBe(0);
      expect(stats.averageAdditions).toBe(0);
      expect(stats.averageDeletions).toBe(0);
    });
  });
});
