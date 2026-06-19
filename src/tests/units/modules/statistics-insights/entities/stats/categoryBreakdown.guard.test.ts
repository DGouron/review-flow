import { describe, it, expect } from 'vitest';

import {
  isValidCategoryBreakdown,
  normalizeBreakdown,
} from '@/modules/statistics-insights/entities/stats/categoryBreakdown.guard.js';

describe('categoryBreakdown guard', () => {
  describe('normalizeBreakdown', () => {
    it('keeps a complete valid breakdown', () => {
      const result = normalizeBreakdown({
        security: 3,
        logic: 5,
        performance: 1,
        typeSafety: 0,
        style: 0,
        dependencies: 0,
      });

      expect(result).toEqual({
        security: 3,
        logic: 5,
        performance: 1,
        typeSafety: 0,
        style: 0,
        dependencies: 0,
      });
    });

    it('fills missing categories with zero', () => {
      const result = normalizeBreakdown({ style: 2 });

      expect(result).toEqual({
        security: 0,
        logic: 0,
        performance: 0,
        typeSafety: 0,
        style: 2,
        dependencies: 0,
      });
    });

    it('drops unknown category labels', () => {
      const result = normalizeBreakdown({ security: 2, cosmic: 9 });

      expect(result).toEqual({
        security: 2,
        logic: 0,
        performance: 0,
        typeSafety: 0,
        style: 0,
        dependencies: 0,
      });
    });

    it('coerces negative or non-integer counts to zero', () => {
      const result = normalizeBreakdown({ security: -4, logic: 2.5, style: 3 });

      expect(result).toEqual({
        security: 0,
        logic: 0,
        performance: 0,
        typeSafety: 0,
        style: 3,
        dependencies: 0,
      });
    });

    it('returns an empty breakdown for non-object input', () => {
      expect(normalizeBreakdown(null)).toEqual({
        security: 0,
        logic: 0,
        performance: 0,
        typeSafety: 0,
        style: 0,
        dependencies: 0,
      });
    });
  });

  describe('isValidCategoryBreakdown', () => {
    it('accepts a complete non-negative-integer breakdown', () => {
      expect(
        isValidCategoryBreakdown({
          security: 0,
          logic: 0,
          performance: 0,
          typeSafety: 0,
          style: 0,
          dependencies: 0,
        }),
      ).toBe(true);
    });

    it('rejects a breakdown with a missing category', () => {
      expect(isValidCategoryBreakdown({ security: 1 })).toBe(false);
    });

    it('rejects a breakdown with a negative count', () => {
      expect(
        isValidCategoryBreakdown({
          security: -1,
          logic: 0,
          performance: 0,
          typeSafety: 0,
          style: 0,
          dependencies: 0,
        }),
      ).toBe(false);
    });
  });
});
