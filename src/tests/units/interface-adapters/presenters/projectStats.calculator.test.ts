import { describe, it, expect } from 'vitest';
import { ProjectStatsCalculator } from '../../../../interface-adapters/presenters/projectStats.calculator.js';
import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';

describe('ProjectStatsCalculator', () => {
  const calculator = new ProjectStatsCalculator();

  it('should return empty stats for an empty list', () => {
    const result = calculator.compute([]);

    expect(result).toEqual({
      totalMrs: 0,
      totalReviews: 0,
      totalFollowups: 0,
      averageReviewsPerMr: 0,
      averageTimeToApproval: null,
      topAssigners: [],
    });
  });

  it('should count total MRs', () => {
    const mrs = [
      TrackedMrFactory.create({ id: 'mr-1' }),
      TrackedMrFactory.create({ id: 'mr-2' }),
    ];

    const result = calculator.compute(mrs);

    expect(result.totalMrs).toBe(2);
  });

  it('should sum reviews and followups across MRs', () => {
    const mrs = [
      TrackedMrFactory.create({ totalReviews: 2, totalFollowups: 1 }),
      TrackedMrFactory.create({ totalReviews: 3, totalFollowups: 2 }),
    ];

    const result = calculator.compute(mrs);

    expect(result.totalReviews).toBe(5);
    expect(result.totalFollowups).toBe(3);
  });

  it('should compute average reviews per MR including followups', () => {
    const mrs = [
      TrackedMrFactory.create({ totalReviews: 2, totalFollowups: 1 }),
      TrackedMrFactory.create({ totalReviews: 1, totalFollowups: 0 }),
    ];

    const result = calculator.compute(mrs);

    expect(result.averageReviewsPerMr).toBe(2);
  });

  it('should compute average time to approval for approved MRs', () => {
    const mrs = [
      TrackedMrFactory.create({
        createdAt: '2024-01-15T10:00:00Z',
        approvedAt: '2024-01-15T12:00:00Z',
      }),
      TrackedMrFactory.create({
        createdAt: '2024-01-16T10:00:00Z',
        approvedAt: '2024-01-16T14:00:00Z',
      }),
    ];

    const result = calculator.compute(mrs);

    const twoHoursMs = 2 * 60 * 60 * 1000;
    const fourHoursMs = 4 * 60 * 60 * 1000;
    expect(result.averageTimeToApproval).toBe((twoHoursMs + fourHoursMs) / 2);
  });

  it('should return null average time when no MR is approved', () => {
    const mrs = [
      TrackedMrFactory.create({ approvedAt: null }),
    ];

    const result = calculator.compute(mrs);

    expect(result.averageTimeToApproval).toBeNull();
  });

  it('should rank top assigners by count', () => {
    const mrs = [
      TrackedMrFactory.create({ assignment: { username: 'alice', assignedAt: '2024-01-15T10:00:00Z' } }),
      TrackedMrFactory.create({ assignment: { username: 'bob', assignedAt: '2024-01-15T10:00:00Z' } }),
      TrackedMrFactory.create({ assignment: { username: 'alice', assignedAt: '2024-01-15T10:00:00Z' } }),
      TrackedMrFactory.create({ assignment: { username: 'alice', assignedAt: '2024-01-15T10:00:00Z' } }),
    ];

    const result = calculator.compute(mrs);

    expect(result.topAssigners[0]).toEqual({ username: 'alice', count: 3 });
    expect(result.topAssigners[1]).toEqual({ username: 'bob', count: 1 });
  });

  it('should limit top assigners to 10', () => {
    const mrs = Array.from({ length: 15 }, (_, index) =>
      TrackedMrFactory.create({
        id: `mr-${index}`,
        assignment: { username: `user-${index}`, assignedAt: '2024-01-15T10:00:00Z' },
      })
    );

    const result = calculator.compute(mrs);

    expect(result.topAssigners).toHaveLength(10);
  });
});
