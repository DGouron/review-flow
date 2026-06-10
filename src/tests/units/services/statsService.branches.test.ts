import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  loadProjectStats,
  saveProjectStats,
  parseReviewOutput,
  addReviewStats,
  getStatsSummary,
} from '@/modules/statistics-insights/services/statsService.js';
import { DiffStatsFactory } from '@/tests/factories/diffStats.factory.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const STATS_RELATIVE_PATH = join('.claude', 'reviews', 'stats.json');

describe('loadProjectStats edge branches', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = join(tmpdir(), `reviewflow-load-${Date.now()}-${Math.random()}`);
  });

  afterEach(() => {
    if (existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('returns empty stats when the stats file does not exist', () => {
    const stats = loadProjectStats(projectPath);

    expect(stats.totalReviews).toBe(0);
    expect(stats.averageScore).toBeNull();
    expect(stats.reviews).toEqual([]);
  });

  it('returns empty stats when the file content is not valid JSON', () => {
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
    writeFileSync(join(projectPath, STATS_RELATIVE_PATH), 'not-json{', 'utf-8');

    const stats = loadProjectStats(projectPath);

    expect(stats.totalReviews).toBe(0);
    expect(stats.reviews).toEqual([]);
  });

  it('returns empty stats when JSON does not match the ProjectStats shape', () => {
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
    writeFileSync(
      join(projectPath, STATS_RELATIVE_PATH),
      JSON.stringify({ totalReviews: 'oops', somethingElse: true }),
      'utf-8',
    );

    const stats = loadProjectStats(projectPath);

    expect(stats.totalReviews).toBe(0);
    expect(stats.reviews).toEqual([]);
  });

  it('coerces a missing reviews field to an empty array when shape is otherwise valid', () => {
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
    writeFileSync(
      join(projectPath, STATS_RELATIVE_PATH),
      JSON.stringify({
        totalReviews: 2,
        totalDuration: 120000,
        lastUpdated: '2024-01-15T10:00:00Z',
      }),
      'utf-8',
    );

    const stats = loadProjectStats(projectPath);

    expect(stats.totalReviews).toBe(2);
    expect(stats.reviews).toEqual([]);
  });

  it('coerces a non-array reviews field to an empty array', () => {
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
    writeFileSync(
      join(projectPath, STATS_RELATIVE_PATH),
      JSON.stringify({
        totalReviews: 1,
        totalDuration: 60000,
        lastUpdated: '2024-01-15T10:00:00Z',
        reviews: 'not-an-array',
      }),
      'utf-8',
    );

    const stats = loadProjectStats(projectPath);

    expect(stats.reviews).toEqual([]);
  });

  it('preserves a valid reviews array on load', () => {
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
    const review = ReviewStatsFactory.create({ id: 'kept' });
    writeFileSync(
      join(projectPath, STATS_RELATIVE_PATH),
      JSON.stringify({
        totalReviews: 1,
        totalDuration: 60000,
        lastUpdated: '2024-01-15T10:00:00Z',
        reviews: [review],
      }),
      'utf-8',
    );

    const stats = loadProjectStats(projectPath);

    expect(stats.reviews).toHaveLength(1);
    expect(stats.reviews[0].id).toBe('kept');
  });
});

describe('saveProjectStats directory branch', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = join(tmpdir(), `reviewflow-save-${Date.now()}-${Math.random()}`);
  });

  afterEach(() => {
    if (existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('creates the reviews directory when it does not exist', () => {
    expect(existsSync(join(projectPath, '.claude', 'reviews'))).toBe(false);

    saveProjectStats(projectPath, ProjectStatsFactory.create());

    expect(existsSync(join(projectPath, STATS_RELATIVE_PATH))).toBe(true);
  });

  it('stamps lastUpdated with a fresh ISO timestamp on save', () => {
    const stats = ProjectStatsFactory.create({ lastUpdated: '2000-01-01T00:00:00Z' });

    saveProjectStats(projectPath, stats);

    const reloaded = loadProjectStats(projectPath);
    expect(reloaded.lastUpdated).not.toBe('2000-01-01T00:00:00Z');
  });
});

describe('parseReviewOutput branch coverage', () => {
  it('parses a full structured stats line', () => {
    const result = parseReviewOutput(
      '[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]',
    );

    expect(result).toEqual({ score: 7.5, blocking: 1, warnings: 2, suggestions: 3 });
  });

  it('leaves defaults when structured fields are partially absent', () => {
    const result = parseReviewOutput('[REVIEW_STATS:blocking=4]');

    expect(result).toEqual({ score: null, blocking: 4, warnings: 0, suggestions: 0 });
  });

  it('parses the summary format with score, blocking, warnings and suggestions', () => {
    const stdout = [
      'Score global : 8/10',
      '🚨 Bloquants : 2',
      '⚠️ Importants : 3',
      '💡 Suggestions : 4',
    ].join('\n');

    const result = parseReviewOutput(stdout);

    expect(result).toEqual({ score: 8, blocking: 2, warnings: 3, suggestions: 4 });
  });

  it('returns summary results when only the score is present alongside a blocking summary line', () => {
    const result = parseReviewOutput('Score global : 6.5/10\n🚨 Bloquant : 1');

    expect(result.score).toBe(6.5);
    expect(result.blocking).toBe(1);
    expect(result.warnings).toBe(0);
    expect(result.suggestions).toBe(0);
  });

  it('falls back to counting inline markers when no summary lines exist', () => {
    const stdout = [
      '🚨 [BLOQUANT] first',
      '🚨 [BLOQUANT] second',
      '⚠️ [IMPORTANT] one',
      '💡 [SUGGESTION] tip',
    ].join('\n');

    const result = parseReviewOutput(stdout);

    expect(result).toEqual({ score: null, blocking: 2, warnings: 1, suggestions: 1 });
  });

  it('reaches the section-header branches without lowering inline marker counts', () => {
    const stdout = [
      '🚨 [BLOQUANT] inline blocker',
      '## Corrections Bloquantes',
      'narrative only, no numbered headers',
      '⚠️ [IMPORTANT] inline warning',
      '## Corrections Importantes',
      'narrative only',
      '💡 [SUGGESTION] inline suggestion',
      '## Suggestions',
      'narrative only',
    ].join('\n');

    const result = parseReviewOutput(stdout);

    expect(result.blocking).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.suggestions).toBe(1);
  });

  it('returns all zeros and null score when nothing matches', () => {
    const result = parseReviewOutput('a review with no recognizable markers at all');

    expect(result).toEqual({ score: null, blocking: 0, warnings: 0, suggestions: 0 });
  });
});

describe('addReviewStats branch coverage', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = join(tmpdir(), `reviewflow-add-${Date.now()}-${Math.random()}`);
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('keeps averageScore null when the review carries no score', () => {
    const review = addReviewStats(projectPath, 7, 60000, 'no markers here');

    expect(review.score).toBeNull();

    const updated = loadProjectStats(projectPath);
    expect(updated.averageScore).toBeNull();
    expect(updated.scoredReviewCount).toBe(0);
  });

  it('stores diffStats and updates additions/deletions aggregates when provided', () => {
    const diffStats = DiffStatsFactory.create({ additions: 80, deletions: 12 });

    const review = addReviewStats(
      projectPath,
      9,
      60000,
      '[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:score=9]',
      'reviewer',
      diffStats,
    );

    expect(review.diffStats).toEqual(diffStats);
    expect(review.assignedBy).toBe('reviewer');

    const updated = loadProjectStats(projectPath);
    expect(updated.totalAdditions).toBe(80);
    expect(updated.totalDeletions).toBe(12);
    expect(updated.averageAdditions).toBe(80);
    expect(updated.averageDeletions).toBe(12);
    expect(updated.diffStatsReviewCount).toBe(1);
  });

  it('defaults diffStats to null when none is supplied', () => {
    const review = addReviewStats(projectPath, 11, 60000, 'no markers');

    expect(review.diffStats).toBeNull();

    const updated = loadProjectStats(projectPath);
    expect(updated.totalAdditions).toBe(0);
    expect(updated.totalDeletions).toBe(0);
    expect(updated.averageAdditions).toBeNull();
    expect(updated.averageDeletions).toBeNull();
  });

  it('leaves assignedBy undefined when not supplied', () => {
    const review = addReviewStats(projectPath, 12, 60000, 'no markers');

    expect(review.assignedBy).toBeUndefined();
  });
});

describe('getStatsSummary formatting and trend branches', () => {
  it('formats durations including hours when above one hour', () => {
    const stats = ProjectStatsFactory.create({
      totalDuration: 3 * 3600000 + 25 * 60000,
      averageDuration: 90 * 60000,
    });

    const summary = getStatsSummary(stats);

    expect(summary.totalTime).toBe('3h 25m');
    expect(summary.averageTime).toBe('1h 30m');
  });

  it('formats durations as minutes only when below one hour', () => {
    const stats = ProjectStatsFactory.create({
      totalDuration: 45 * 60000,
      averageDuration: 45 * 60000,
    });

    const summary = getStatsSummary(stats);

    expect(summary.totalTime).toBe('45m');
    expect(summary.averageTime).toBe('45m');
  });

  it('renders averageScore as "-" when it is null', () => {
    const stats = ProjectStatsFactory.create({ averageScore: null });

    const summary = getStatsSummary(stats);

    expect(summary.averageScore).toBe('-');
  });

  it('keeps trends stable when there are too few reviews to compare', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'a', score: 8, blocking: 0 }),
      ReviewStatsFactory.create({ id: 'b', score: 8, blocking: 0 }),
    ];
    const stats = ProjectStatsFactory.withReviews(reviews);

    const summary = getStatsSummary(stats);

    expect(summary.trend.score).toBe('stable');
    expect(summary.trend.blocking).toBe('stable');
  });

  it('reports score up and blocking up when recent reviews improve', () => {
    const previous = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `p${index}`, score: 5, blocking: 3 }),
    );
    const recent = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `r${index}`, score: 9, blocking: 0 }),
    );
    const stats = ProjectStatsFactory.withReviews([...previous, ...recent]);

    const summary = getStatsSummary(stats);

    expect(summary.trend.score).toBe('up');
    expect(summary.trend.blocking).toBe('up');
  });

  it('reports score down and blocking down when recent reviews worsen', () => {
    const previous = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `p${index}`, score: 9, blocking: 0 }),
    );
    const recent = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `r${index}`, score: 5, blocking: 4 }),
    );
    const stats = ProjectStatsFactory.withReviews([...previous, ...recent]);

    const summary = getStatsSummary(stats);

    expect(summary.trend.score).toBe('down');
    expect(summary.trend.blocking).toBe('down');
  });

  it('keeps score trend stable when no scored reviews exist in either window', () => {
    const previous = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `p${index}`, score: null, blocking: 1 }),
    );
    const recent = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `r${index}`, score: null, blocking: 1 }),
    );
    const stats = ProjectStatsFactory.withReviews([...previous, ...recent]);

    const summary = getStatsSummary(stats);

    expect(summary.trend.score).toBe('stable');
    expect(summary.trend.blocking).toBe('stable');
  });

  it('keeps score trend stable when changes stay within the threshold', () => {
    const previous = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `p${index}`, score: 7, blocking: 1 }),
    );
    const recent = Array.from({ length: 5 }, (_, index) =>
      ReviewStatsFactory.create({ id: `r${index}`, score: 7.2, blocking: 1 }),
    );
    const stats = ProjectStatsFactory.withReviews([...previous, ...recent]);

    const summary = getStatsSummary(stats);

    expect(summary.trend.score).toBe('stable');
    expect(summary.trend.blocking).toBe('stable');
  });
});
