import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import {
  BUG_CATEGORY_KEYS,
  emptyBreakdown,
  type CategoryBreakdown,
} from '@/modules/statistics-insights/entities/stats/bugCategory.js';
import { normalizeBreakdown } from '@/modules/statistics-insights/entities/stats/categoryBreakdown.guard.js';
import type {
  ReviewStats,
  ProjectStats,
} from '@/modules/statistics-insights/entities/stats/projectStats.js';

export type { ReviewStats, ProjectStats };

/**
 * Get the stats file path for a project
 */
function getStatsPath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'stats.json');
}

function hasProperty<K extends string>(object: object, key: K): object is Record<K, unknown> {
  return key in object;
}

function isProjectStatsShape(value: unknown): value is ProjectStats {
  if (typeof value !== 'object' || value === null) return false;
  return (
    hasProperty(value, 'totalReviews') &&
    typeof value.totalReviews === 'number' &&
    hasProperty(value, 'totalDuration') &&
    typeof value.totalDuration === 'number' &&
    hasProperty(value, 'lastUpdated') &&
    typeof value.lastUpdated === 'string'
  );
}

/**
 * Load project statistics
 */
export function loadProjectStats(projectPath: string): ProjectStats {
  const statsPath = getStatsPath(projectPath);

  if (!existsSync(statsPath)) {
    return createEmptyStats();
  }

  try {
    const content = readFileSync(statsPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);

    if (!isProjectStatsShape(parsed)) {
      return createEmptyStats();
    }

    if (!Array.isArray(parsed.reviews)) {
      parsed.reviews = [];
    }

    return parsed;
  } catch {
    return createEmptyStats();
  }
}

/**
 * Save project statistics
 */
export function saveProjectStats(projectPath: string, stats: ProjectStats): void {
  const statsPath = getStatsPath(projectPath);

  // Ensure directory exists
  const dir = dirname(statsPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  stats.lastUpdated = new Date().toISOString();
  writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf-8');
}

/**
 * Create empty stats object
 */
function createEmptyStats(): ProjectStats {
  return {
    totalReviews: 0,
    totalDuration: 0,
    averageScore: null,
    averageDuration: 0,
    totalBlocking: 0,
    totalWarnings: 0,
    totalAdditions: 0,
    totalDeletions: 0,
    averageAdditions: null,
    averageDeletions: null,
    reviews: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Parse review output to extract statistics
 *
 * Supports two formats:
 * 1. Summary format (from skill output):
 *    Score global : X/10
 *    Bloquants : X
 *    Importants : X
 *
 * 2. Structured stats line:
 *    [REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]
 *
 * 3. Inline markers (fallback):
 *    [BLOQUANT], [IMPORTANT], [SUGGESTION]
 *
 * The structured stats line may carry an optional categories segment:
 *    [REVIEW_STATS:...:categories=security=3,logic=5,performance=1]
 * Absent segment yields a null breakdown (legacy / no category data).
 */
export interface ParsedReviewOutput {
  score: number | null;
  blocking: number;
  warnings: number;
  suggestions: number;
  categoryBreakdown: CategoryBreakdown | null;
}

function parseCategoriesSegment(statsStr: string): CategoryBreakdown | null {
  const categoriesMatch = statsStr.match(/categories=([^:]+)/i);
  if (!categoriesMatch) return null;

  const rawCounts: Record<string, number> = {};
  for (const pair of categoriesMatch[1].split(',')) {
    const [key, value] = pair.split('=');
    const count = Number.parseInt(value, 10);
    if (key && Number.isInteger(count)) {
      rawCounts[key.trim()] = count;
    }
  }

  return normalizeBreakdown(rawCounts);
}

export function parseReviewOutput(stdout: string): ParsedReviewOutput {
  let score: number | null = null;
  let blocking = 0;
  let warnings = 0;
  let suggestions = 0;

  // Method 1: Parse structured stats line (most reliable)
  // Format: [REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]
  const statsLineMatch = stdout.match(/\[REVIEW_STATS:([^\]]+)\]/i);
  if (statsLineMatch) {
    const statsStr = statsLineMatch[1];
    const blockingMatch = statsStr.match(/blocking=(\d+)/);
    const warningsMatch = statsStr.match(/warnings=(\d+)/);
    const suggestionsMatch = statsStr.match(/suggestions=(\d+)/);
    const scoreMatch = statsStr.match(/score=(\d+(?:\.\d+)?)/);

    if (blockingMatch) blocking = Number.parseInt(blockingMatch[1], 10);
    if (warningsMatch) warnings = Number.parseInt(warningsMatch[1], 10);
    if (suggestionsMatch) suggestions = Number.parseInt(suggestionsMatch[1], 10);
    if (scoreMatch) score = Number.parseFloat(scoreMatch[1]);

    return {
      score,
      blocking,
      warnings,
      suggestions,
      categoryBreakdown: parseCategoriesSegment(statsStr),
    };
  }

  // Method 2: Parse summary format (skill output)
  const scoreMatch = stdout.match(/Score\s+[Gg]lobal\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if (scoreMatch) {
    score = Number.parseFloat(scoreMatch[1]);
  }

  const blockingSummary = stdout.match(/🚨\s*Bloquants?\s*:\s*(\d+)/i);
  if (blockingSummary) {
    blocking = Number.parseInt(blockingSummary[1], 10);
  }

  const warningsSummary = stdout.match(/⚠️\s*Importants?\s*:\s*(\d+)/i);
  if (warningsSummary) {
    warnings = Number.parseInt(warningsSummary[1], 10);
  }

  const suggestionsSummary = stdout.match(
    /(?:📝|💡)\s*(?:Améliorations?|Suggestions?)[^:]*:\s*(\d+)/i,
  );
  if (suggestionsSummary) {
    suggestions = Number.parseInt(suggestionsSummary[1], 10);
  }

  // If summary format worked, return
  if (blockingSummary || warningsSummary || suggestionsSummary) {
    return { score, blocking, warnings, suggestions, categoryBreakdown: null };
  }

  // Method 3: Fallback - count inline markers
  const blockingMatches = stdout.match(/🚨\s*\*?\*?\[BLOQUANT\]/gi);
  if (blockingMatches) {
    blocking = blockingMatches.length;
  }

  const blockingSection = stdout.match(/##\s+Corrections?\s+Bloquantes?[\s\S]*?(?=##\s|$)/i);
  if (blockingSection) {
    const blockingHeaders = blockingSection[0].match(/^###\s+\d+\./gm);
    if (blockingHeaders && blockingHeaders.length > blocking) {
      blocking = blockingHeaders.length;
    }
  }

  const warningMatches = stdout.match(/⚠️\s*\*?\*?\[IMPORTANT\]/gi);
  if (warningMatches) {
    warnings = warningMatches.length;
  }

  const warningSection = stdout.match(/##\s+Corrections?\s+Importantes?[\s\S]*?(?=##\s|$)/i);
  if (warningSection) {
    const warningHeaders = warningSection[0].match(/^###\s+\d+\./gm);
    if (warningHeaders && warningHeaders.length > warnings) {
      warnings = warningHeaders.length;
    }
  }

  const suggestionMatches = stdout.match(/💡\s*\*?\*?\[SUGGESTION\]/gi);
  if (suggestionMatches) {
    suggestions = suggestionMatches.length;
  }

  const suggestionSection = stdout.match(/##\s+Suggestions?[\s\S]*?(?=##\s|$)/i);
  if (suggestionSection) {
    const suggestionHeaders = suggestionSection[0].match(/^###\s+\d+\./gm);
    if (suggestionHeaders && suggestionHeaders.length > suggestions) {
      suggestions = suggestionHeaders.length;
    }
  }

  return { score, blocking, warnings, suggestions, categoryBreakdown: null };
}

/**
 * Add a review to project statistics
 */
export function addReviewStats(
  projectPath: string,
  mrNumber: number,
  duration: number,
  stdout: string,
  assignedBy?: string,
  diffStats?: DiffStats | null,
): ReviewStats {
  const stats = loadProjectStats(projectPath);
  const parsed = parseReviewOutput(stdout);

  const now = new Date();
  const reviewStats: ReviewStats = {
    id: `${now.getTime()}-${mrNumber}`,
    timestamp: now.toISOString(),
    mrNumber,
    duration,
    score: parsed.score,
    blocking: parsed.blocking,
    warnings: parsed.warnings,
    suggestions: parsed.suggestions,
    assignedBy,
    diffStats: diffStats ?? null,
    categoryBreakdown: parsed.categoryBreakdown,
  };

  initializeCumulativeCounters(stats);

  stats.reviews.push(reviewStats);
  updateAggregatesForNewReview(stats, reviewStats);

  if (stats.reviews.length > 100) {
    stats.reviews = stats.reviews.slice(-100);
  }

  saveProjectStats(projectPath, stats);

  return reviewStats;
}

function addBreakdown(target: CategoryBreakdown, contribution: CategoryBreakdown): void {
  for (const key of BUG_CATEGORY_KEYS) {
    target[key] += contribution[key];
  }
}

function initializeCumulativeCounters(stats: ProjectStats): void {
  if (stats.categoryBreakdown === undefined) {
    const aggregate = emptyBreakdown();
    for (const review of stats.reviews) {
      if (review.categoryBreakdown != null) {
        addBreakdown(aggregate, review.categoryBreakdown);
      }
    }
    stats.categoryBreakdown = aggregate;
  }

  if (stats.totalScoreSum !== undefined) return;

  const reviewsWithScore = stats.reviews.filter((r) => r.score !== null);
  stats.totalScoreSum = reviewsWithScore.reduce((sum, r) => sum + (r.score ?? 0), 0);
  stats.scoredReviewCount = reviewsWithScore.length;

  const reviewsWithDiffStats = stats.reviews.filter((r) => r.diffStats != null);
  stats.diffStatsReviewCount = reviewsWithDiffStats.length;
}

function updateAggregatesForNewReview(stats: ProjectStats, review: ReviewStats): void {
  stats.totalReviews += 1;
  stats.totalDuration += review.duration;
  stats.averageDuration = stats.totalDuration / stats.totalReviews;
  stats.totalBlocking += review.blocking;
  stats.totalWarnings += review.warnings;

  if (review.score !== null) {
    stats.totalScoreSum = (stats.totalScoreSum ?? 0) + review.score;
    stats.scoredReviewCount = (stats.scoredReviewCount ?? 0) + 1;
  }

  if (stats.scoredReviewCount && stats.scoredReviewCount > 0) {
    stats.averageScore = (stats.totalScoreSum ?? 0) / stats.scoredReviewCount;
  }

  if (review.diffStats) {
    stats.totalAdditions += review.diffStats.additions;
    stats.totalDeletions += review.diffStats.deletions;
    stats.diffStatsReviewCount = (stats.diffStatsReviewCount ?? 0) + 1;
  }

  if (stats.diffStatsReviewCount && stats.diffStatsReviewCount > 0) {
    stats.averageAdditions = stats.totalAdditions / stats.diffStatsReviewCount;
    stats.averageDeletions = stats.totalDeletions / stats.diffStatsReviewCount;
  }

  if (review.categoryBreakdown != null) {
    stats.categoryBreakdown = stats.categoryBreakdown ?? emptyBreakdown();
    addBreakdown(stats.categoryBreakdown, review.categoryBreakdown);
  }
}

/**
 * Format a review duration in milliseconds as a human-readable string
 * (e.g. "4m", "1h 12m"). Single source of truth shared by the stats
 * summary and the analytics header presenter.
 */
export function formatReviewDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Get statistics summary for display
 */
export function getStatsSummary(stats: ProjectStats): {
  totalReviews: number;
  totalTime: string;
  averageTime: string;
  averageScore: string;
  totalBlocking: number;
  totalWarnings: number;
  totalAdditions: number;
  totalDeletions: number;
  averageAdditions: string;
  averageDeletions: string;
  totalLinesReviewed: number;
  trend: { score: 'up' | 'down' | 'stable'; blocking: 'up' | 'down' | 'stable' };
} {
  // Calculate trend based on last 5 vs previous 5 reviews
  const recent = stats.reviews.slice(-5);
  const previous = stats.reviews.slice(-10, -5);

  let scoreTrend: 'up' | 'down' | 'stable' = 'stable';
  let blockingTrend: 'up' | 'down' | 'stable' = 'stable';

  if (recent.length >= 3 && previous.length >= 3) {
    const recentScores = recent.filter((r) => r.score !== null);
    const prevScores = previous.filter((r) => r.score !== null);

    if (recentScores.length > 0 && prevScores.length > 0) {
      const avgRecent = recentScores.reduce((s, r) => s + (r.score ?? 0), 0) / recentScores.length;
      const avgPrev = prevScores.reduce((s, r) => s + (r.score ?? 0), 0) / prevScores.length;
      if (avgRecent > avgPrev + 0.5) scoreTrend = 'up';
      else if (avgRecent < avgPrev - 0.5) scoreTrend = 'down';
    }

    const avgBlockingRecent = recent.reduce((s, r) => s + r.blocking, 0) / recent.length;
    const avgBlockingPrev = previous.reduce((s, r) => s + r.blocking, 0) / previous.length;
    if (avgBlockingRecent < avgBlockingPrev - 0.5)
      blockingTrend = 'up'; // fewer blocking = good = up
    else if (avgBlockingRecent > avgBlockingPrev + 0.5) blockingTrend = 'down';
  }

  return {
    totalReviews: stats.totalReviews,
    totalTime: formatReviewDuration(stats.totalDuration),
    averageTime: formatReviewDuration(stats.averageDuration),
    averageScore: stats.averageScore !== null ? stats.averageScore.toFixed(1) : '-',
    totalBlocking: stats.totalBlocking,
    totalWarnings: stats.totalWarnings,
    totalAdditions: stats.totalAdditions,
    totalDeletions: stats.totalDeletions,
    averageAdditions: stats.averageAdditions !== null ? stats.averageAdditions.toFixed(1) : '-',
    averageDeletions: stats.averageDeletions !== null ? stats.averageDeletions.toFixed(1) : '-',
    totalLinesReviewed: stats.totalAdditions + stats.totalDeletions,
    trend: { score: scoreTrend, blocking: blockingTrend },
  };
}
