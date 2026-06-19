import { describe, it, expect } from 'vitest';

import {
  BUG_CATEGORY_KEYS,
  BUG_CATEGORY_LABELS,
  emptyBreakdown,
} from '@/modules/statistics-insights/entities/stats/bugCategory.js';

describe('bugCategory', () => {
  it('exposes the six category keys in display order', () => {
    expect(BUG_CATEGORY_KEYS).toEqual([
      'security',
      'logic',
      'performance',
      'typeSafety',
      'style',
      'dependencies',
    ]);
  });

  it('maps every key to a display label', () => {
    expect(BUG_CATEGORY_LABELS).toEqual({
      security: 'Security',
      logic: 'Logic',
      performance: 'Performance',
      typeSafety: 'Type Safety',
      style: 'Style',
      dependencies: 'Dependencies',
    });
  });

  it('builds an empty breakdown with every category at zero', () => {
    expect(emptyBreakdown()).toEqual({
      security: 0,
      logic: 0,
      performance: 0,
      typeSafety: 0,
      style: 0,
      dependencies: 0,
    });
  });
});
