import { z } from 'zod';

import { categoryBreakdownSchema } from '@/modules/statistics-insights/entities/stats/categoryBreakdown.schema.js';

const diffStatsSchema = z.object({
  commitsCount: z.number(),
  additions: z.number(),
  deletions: z.number(),
});

export const reviewStatsSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  mrNumber: z.number(),
  duration: z.number(),
  score: z.number().nullable(),
  blocking: z.number(),
  warnings: z.number(),
  suggestions: z.number().optional(),
  assignedBy: z.string().optional(),
  diffStats: diffStatsSchema.nullable().optional(),
  categoryBreakdown: categoryBreakdownSchema.nullable().optional(),
});

export const projectStatsSchema = z.object({
  totalReviews: z.number(),
  totalDuration: z.number(),
  averageScore: z.number().nullable(),
  averageDuration: z.number(),
  totalBlocking: z.number(),
  totalWarnings: z.number(),
  reviews: z.array(reviewStatsSchema),
  lastUpdated: z.string(),
  totalAdditions: z.number(),
  totalDeletions: z.number(),
  averageAdditions: z.number().nullable(),
  averageDeletions: z.number().nullable(),
  totalCommits: z.number().optional(),
  averageCommits: z.number().nullable().optional(),
  totalScoreSum: z.number().optional(),
  scoredReviewCount: z.number().optional(),
  diffStatsReviewCount: z.number().optional(),
  categoryBreakdown: categoryBreakdownSchema.optional(),
});
