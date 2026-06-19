import { describe, it, expect } from 'vitest';

import {
  isValidProjectStats,
  safeParseProjectStats,
} from '@/modules/statistics-insights/entities/stats/projectStats.guard.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

describe('projectStats schema validation', () => {
  it('accepts a fully populated ProjectStats', () => {
    const stats = ProjectStatsFactory.withReviews([
      ReviewStatsFactory.create({ id: 'r1', score: 8 }),
    ]);

    expect(isValidProjectStats(stats)).toBe(true);
  });

  it('accepts an empty ProjectStats', () => {
    expect(isValidProjectStats(ProjectStatsFactory.create())).toBe(true);
  });

  it('accepts an old-format stats.json that omits optional fields', () => {
    const oldFormat = {
      totalReviews: 2,
      totalDuration: 120000,
      averageScore: 7,
      averageDuration: 60000,
      totalBlocking: 1,
      totalWarnings: 3,
      reviews: [
        {
          id: 'legacy-1',
          timestamp: '2024-01-01T10:00:00Z',
          mrNumber: 1,
          duration: 60000,
          score: 7,
          blocking: 0,
          warnings: 1,
        },
      ],
      lastUpdated: '2024-01-02T10:00:00Z',
      totalAdditions: 0,
      totalDeletions: 0,
      averageAdditions: null,
      averageDeletions: null,
    };

    expect(isValidProjectStats(oldFormat)).toBe(true);
  });

  it('rejects an object missing required fields', () => {
    const result = safeParseProjectStats({ totalReviews: 'oops' });

    expect(result.success).toBe(false);
  });

  it('accepts a null averageScore', () => {
    const result = safeParseProjectStats(ProjectStatsFactory.create({ averageScore: null }));

    expect(result.success).toBe(true);
  });
});
