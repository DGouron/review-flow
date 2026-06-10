import type { z } from 'zod';

import type {
  teamInsightSchema,
  averageLevelsSchema,
} from '@/modules/statistics-insights/entities/insight/teamInsight.schema.js';

export type AverageLevels = z.infer<typeof averageLevelsSchema>;

export type TeamInsight = z.infer<typeof teamInsightSchema>;
