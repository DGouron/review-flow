import { z } from 'zod';

import {
  BUG_CATEGORY_KEYS,
  emptyBreakdown,
  type CategoryBreakdown,
} from '@/modules/statistics-insights/entities/stats/bugCategory.js';
import { categoryBreakdownSchema } from '@/modules/statistics-insights/entities/stats/categoryBreakdown.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

const categoryBreakdownGuard = createGuard(categoryBreakdownSchema, 'categoryBreakdown');

export const isValidCategoryBreakdown = categoryBreakdownGuard.isValid;
export const safeParseCategoryBreakdown = categoryBreakdownGuard.safeParse;

const countSchema = z.number().int().nonnegative();

function readKey(source: Record<string, unknown>, key: string): number {
  const parsed = countSchema.safeParse(source[key]);
  return parsed.success ? parsed.data : 0;
}

export function normalizeBreakdown(data: unknown): CategoryBreakdown {
  if (typeof data !== 'object' || data === null) {
    return emptyBreakdown();
  }

  const source = z.record(z.string(), z.unknown()).safeParse(data);
  if (!source.success) {
    return emptyBreakdown();
  }

  const breakdown = emptyBreakdown();
  for (const key of BUG_CATEGORY_KEYS) {
    breakdown[key] = readKey(source.data, key);
  }
  return breakdown;
}
