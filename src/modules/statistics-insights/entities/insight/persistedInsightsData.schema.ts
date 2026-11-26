import { z } from 'zod';

import {
  QUALITY_GRADES,
  REVIEW_VERDICTS,
} from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';
import { aiInsightsResultSchema } from '@/modules/statistics-insights/entities/insight/aiInsight.schema.js';

const reviewStatsForPersistenceSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  mrNumber: z.number(),
  duration: z.number(),
  score: z.number().nullable(),
  blocking: z.number(),
  warnings: z.number(),
  suggestions: z.number().optional(),
  assignedBy: z.string().optional(),
  diffStats: z
    .object({
      commitsCount: z.number(),
      additions: z.number(),
      deletions: z.number(),
    })
    .nullable()
    .optional(),
  verdict: z.enum(REVIEW_VERDICTS).nullable().optional(),
  grade: z.enum(QUALITY_GRADES).nullable().optional(),
});

export const persistedDeveloperMetricsSchema = z.object({
  developerName: z.string().min(1),
  totalReviews: z.number().int().min(0),
  /** Absent from files written before verdicts: seeded from recentReviews on the next run. */
  judgedReviewCount: z.number().int().min(0).optional(),
  readyReviewCount: z.number().int().min(0).optional(),
  /** Legacy /10 accumulators, still read from older files, never written again. */
  totalScore: z.number().min(0).optional(),
  scoredReviewCount: z.number().int().min(0).optional(),
  totalBlocking: z.number().int().min(0),
  totalWarnings: z.number().int().min(0),
  totalSuggestions: z.number().int().min(0),
  totalDuration: z.number().min(0),
  totalAdditions: z.number().int().min(0),
  totalDeletions: z.number().int().min(0),
  diffStatsReviewCount: z.number().int().min(0),
  recentReviews: z.array(reviewStatsForPersistenceSchema),
});

export const persistedInsightsDataSchema = z.object({
  developers: z.array(persistedDeveloperMetricsSchema),
  processedReviewIds: z.array(z.string()),
  lastUpdated: z.string().min(1),
  aiInsights: aiInsightsResultSchema.nullable().default(null),
  reviewCountAtAiGeneration: z.number().int().min(0).default(0),
});
