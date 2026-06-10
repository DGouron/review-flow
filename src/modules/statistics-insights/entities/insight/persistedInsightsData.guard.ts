import type { PersistedInsightsData } from '@/modules/statistics-insights/entities/insight/persistedInsightsData.js';
import { persistedInsightsDataSchema } from '@/modules/statistics-insights/entities/insight/persistedInsightsData.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const persistedInsightsDataGuard = createGuard(
  persistedInsightsDataSchema,
  'persistedInsightsData',
);

export function parsePersistedInsightsData(data: unknown): PersistedInsightsData {
  return persistedInsightsDataGuard.parse(data);
}

export function safeParsePersistedInsightsData(data: unknown) {
  return persistedInsightsDataGuard.safeParse(data);
}

export function isValidPersistedInsightsData(data: unknown): data is PersistedInsightsData {
  return persistedInsightsDataGuard.isValid(data);
}
