import { describe, it, expect } from 'vitest';

import {
  parsePersistedInsightsData,
  safeParsePersistedInsightsData,
  isValidPersistedInsightsData,
} from '@/modules/statistics-insights/entities/insight/persistedInsightsData.guard.js';

const validData = {
  developers: [],
  processedReviewIds: ['r1'],
  lastUpdated: '2026-03-15T10:00:00Z',
  aiInsights: null,
  reviewCountAtAiGeneration: 0,
};

describe('persistedInsightsData.guard', () => {
  it('parses a valid persisted-insights object', () => {
    const result = parsePersistedInsightsData(validData);
    expect(result.processedReviewIds).toEqual(['r1']);
  });

  it('throws when parsing an invalid object', () => {
    expect(() => parsePersistedInsightsData({ developers: 'nope' })).toThrow();
  });

  it('safeParse succeeds on a valid object', () => {
    expect(safeParsePersistedInsightsData(validData).success).toBe(true);
  });

  it('safeParse fails on an invalid object', () => {
    expect(safeParsePersistedInsightsData(null).success).toBe(false);
  });

  it('isValid returns true for a valid object and false otherwise', () => {
    expect(isValidPersistedInsightsData(validData)).toBe(true);
    expect(isValidPersistedInsightsData({})).toBe(false);
  });
});
