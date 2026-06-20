import { describe, it, expect } from 'vitest';

import { formatReviewDuration } from '@/modules/statistics-insights/entities/stats/reviewDuration.format.js';

describe('formatReviewDuration', () => {
  it('formats sub-hour durations as minutes only', () => {
    expect(formatReviewDuration(252000)).toBe('4m');
  });

  it('formats hour-plus durations as hours and minutes', () => {
    expect(formatReviewDuration(4320000)).toBe('1h 12m');
  });

  it('formats zero as zero minutes', () => {
    expect(formatReviewDuration(0)).toBe('0m');
  });
});
