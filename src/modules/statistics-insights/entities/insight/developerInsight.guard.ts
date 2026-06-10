import type { DeveloperInsight } from '@/modules/statistics-insights/entities/insight/developerInsight.js';
import { developerInsightSchema } from '@/modules/statistics-insights/entities/insight/developerInsight.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const developerInsightGuard = createGuard(developerInsightSchema, 'developerInsight');

export function parseDeveloperInsight(data: unknown): DeveloperInsight {
  return developerInsightGuard.parse(data);
}

export function safeParseDeveloperInsight(data: unknown) {
  return developerInsightGuard.safeParse(data);
}

export function isValidDeveloperInsight(data: unknown): data is DeveloperInsight {
  return developerInsightGuard.isValid(data);
}
