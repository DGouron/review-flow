import type { z } from 'zod';

import type {
  projectStatsSchema,
  reviewStatsSchema,
} from '@/modules/statistics-insights/entities/stats/projectStats.schema.js';

/**
 * Statistics for a single code review, including score, issue counts,
 * and optional diff-level metrics (additions/deletions).
 */
export type ReviewStats = z.infer<typeof reviewStatsSchema>;

/**
 * Aggregated statistics for all reviews in a project, including
 * totals, averages, trends data, and diff-level aggregates.
 */
export type ProjectStats = z.infer<typeof projectStatsSchema>;

/**
 * Create an empty ProjectStats — the load-or-empty seed used when a project
 * has no recorded reviews yet. Single source of truth shared by the stats use
 * cases and gateways.
 */
export function createEmptyStats(): ProjectStats {
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
    totalCommits: 0,
    averageCommits: null,
    reviews: [],
    lastUpdated: new Date().toISOString(),
  };
}
