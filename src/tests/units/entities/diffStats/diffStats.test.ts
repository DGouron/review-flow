import { describe, it, expect } from 'vitest';

import { DiffStatsFactory } from '@/tests/factories/diffStats.factory.js';

describe('DiffStats', () => {
  it('should represent diff statistics with commits count, additions, and deletions', () => {
    const diffStats = DiffStatsFactory.create();

    expect(diffStats.commitsCount).toBe(3);
    expect(diffStats.additions).toBe(150);
    expect(diffStats.deletions).toBe(30);
  });

  it('should support zero values for all fields', () => {
    const diffStats = DiffStatsFactory.create({
      commitsCount: 0,
      additions: 0,
      deletions: 0,
    });

    expect(diffStats.commitsCount).toBe(0);
    expect(diffStats.additions).toBe(0);
    expect(diffStats.deletions).toBe(0);
  });

  it('should allow overriding individual fields', () => {
    const diffStats = DiffStatsFactory.create({ additions: 500 });

    expect(diffStats.commitsCount).toBe(3);
    expect(diffStats.additions).toBe(500);
    expect(diffStats.deletions).toBe(30);
  });
});
