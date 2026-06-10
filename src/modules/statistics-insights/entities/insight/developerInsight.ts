import type { z } from 'zod';

import type {
  developerInsightSchema,
  categoryLevelSchema,
  categoryLevelsSchema,
  developerMetricsSchema,
  insightDescriptionSchema,
} from '@/modules/statistics-insights/entities/insight/developerInsight.schema.js';

export type CategoryLevel = z.infer<typeof categoryLevelSchema>;

export type CategoryLevels = z.infer<typeof categoryLevelsSchema>;

export type DeveloperMetrics = z.infer<typeof developerMetricsSchema>;

export type InsightDescription = z.infer<typeof insightDescriptionSchema>;

export type DeveloperInsight = z.infer<typeof developerInsightSchema>;
