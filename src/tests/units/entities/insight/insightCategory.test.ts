import { describe, it, expect } from 'vitest';

import {
  insightCategorySchema,
  INSIGHT_CATEGORIES,
} from '@/modules/statistics-insights/entities/insight/insightCategory.js';

describe('InsightCategory', () => {
  it('should define four insight categories', () => {
    expect(INSIGHT_CATEGORIES).toEqual(['quality', 'responsiveness', 'codeVolume', 'iteration']);
  });

  it('should validate a valid category', () => {
    const result = insightCategorySchema.safeParse('quality');

    expect(result.success).toBe(true);
  });

  it('should reject an invalid category', () => {
    const result = insightCategorySchema.safeParse('unknown');

    expect(result.success).toBe(false);
  });
});
