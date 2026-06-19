import { describe, it, expect } from 'vitest';

import { reviewsPerMonth } from '@/modules/statistics-insights/entities/stats/monthlyVolume.js';
import { ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const NOW = new Date('2024-12-15T12:00:00Z');

describe('reviewsPerMonth', () => {
  it('returns exactly twelve trailing months ending at now', () => {
    const points = reviewsPerMonth([], NOW);

    expect(points).toHaveLength(12);
    expect(points[0].month).toBe('2024-01');
    expect(points[11].month).toBe('2024-12');
  });

  it('reports zero for months without reviews', () => {
    const points = reviewsPerMonth([], NOW);

    expect(points.every((point) => point.count === 0)).toBe(true);
  });

  it('buckets reviews by calendar month', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'a', timestamp: '2024-01-10T10:00:00Z' }),
      ReviewStatsFactory.create({ id: 'b', timestamp: '2024-01-28T10:00:00Z' }),
      ReviewStatsFactory.create({ id: 'c', timestamp: '2024-06-05T10:00:00Z' }),
    ];

    const points = reviewsPerMonth(reviews, NOW);
    const byMonth = new Map(points.map((point) => [point.month, point.count]));

    expect(byMonth.get('2024-01')).toBe(2);
    expect(byMonth.get('2024-06')).toBe(1);
    expect(byMonth.get('2024-03')).toBe(0);
  });

  it('ignores reviews outside the trailing twelve-month window', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'old', timestamp: '2022-05-01T10:00:00Z' }),
      ReviewStatsFactory.create({ id: 'recent', timestamp: '2024-12-01T10:00:00Z' }),
    ];

    const points = reviewsPerMonth(reviews, NOW);
    const total = points.reduce((sum, point) => sum + point.count, 0);

    expect(total).toBe(1);
  });

  it('respects the injected now to slide the window', () => {
    const points = reviewsPerMonth([], new Date('2024-03-15T12:00:00Z'));

    expect(points[0].month).toBe('2023-04');
    expect(points[11].month).toBe('2024-03');
  });
});
