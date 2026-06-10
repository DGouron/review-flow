import { describe, it, expect } from 'vitest';

import { lastSweepSummarySchema } from '@/modules/worktree-management/entities/sweep/lastSweepSummary.schema.js';

describe('lastSweepSummarySchema', () => {
  it('parses a well-formed sweep summary', () => {
    const parsed = lastSweepSummarySchema.parse({
      ranAt: new Date('2026-05-23T03:00:00.000Z'),
      removed: 2,
      failures: 0,
      scanned: 9,
    });

    expect(parsed.ranAt.toISOString()).toBe('2026-05-23T03:00:00.000Z');
    expect(parsed.removed).toBe(2);
    expect(parsed.failures).toBe(0);
    expect(parsed.scanned).toBe(9);
  });

  it('rejects negative counters', () => {
    const result = lastSweepSummarySchema.safeParse({
      ranAt: new Date(),
      removed: -1,
      failures: 0,
      scanned: 0,
    });

    expect(result.success).toBe(false);
  });

  it('rejects non-integer counters', () => {
    const result = lastSweepSummarySchema.safeParse({
      ranAt: new Date(),
      removed: 1.5,
      failures: 0,
      scanned: 0,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid ranAt', () => {
    const result = lastSweepSummarySchema.safeParse({
      ranAt: 'not-a-date',
      removed: 0,
      failures: 0,
      scanned: 0,
    });

    expect(result.success).toBe(false);
  });
});
