import { describe, it, expect } from 'vitest';

import {
  insightTrendSchema,
  INSIGHT_TRENDS,
} from '@/modules/statistics-insights/entities/insight/insightTrend.js';

describe('InsightTrend', () => {
  it('should define three trend values', () => {
    expect(INSIGHT_TRENDS).toEqual(['improving', 'declining', 'stable']);
  });

  it('should validate a valid trend', () => {
    const result = insightTrendSchema.safeParse('improving');

    expect(result.success).toBe(true);
  });

  it('should reject an invalid trend', () => {
    const result = insightTrendSchema.safeParse('unknown');

    expect(result.success).toBe(false);
  });
});
