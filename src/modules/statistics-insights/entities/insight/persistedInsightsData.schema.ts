import { z } from 'zod';

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
});

export const persistedDeveloperMetricsSchema = z.object({
  developerName: z.string().min(1),
  totalReviews: z.number().int().min(0),
  totalScore: z.number().min(0),
  scoredReviewCount: z.number().int().min(0),
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
