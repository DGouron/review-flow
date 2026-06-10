import { z } from 'zod';

import { insightCategorySchema } from '@/modules/statistics-insights/entities/insight/insightCategory.js';

export const averageLevelsSchema = z.object({
  quality: z.number().min(1).max(10),
  responsiveness: z.number().min(1).max(10),
  codeVolume: z.number().min(1).max(10),
  iteration: z.number().min(1).max(10),
});

export const teamInsightSchema = z.object({
  developerCount: z.number().int().min(0),
  totalReviewCount: z.number().int().min(0),
  averageLevels: averageLevelsSchema,
  strengths: z.array(insightCategorySchema),
  weaknesses: z.array(insightCategorySchema),
  tips: z.array(z.string()),
});
