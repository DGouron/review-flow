import { describe, it, expect } from 'vitest';

import { planRetry } from '@/modules/claude-invocation/entities/retrySchedule/retrySchedule.valueObject.js';

describe('RetrySchedule value object', () => {
  it('returns 60s delay on the first retry', () => {
    const decision = planRetry(0);

    expect(decision.status).toBe('retry');
    if (decision.status === 'retry') {
      expect(decision.delayMs).toBe(60_000);
      expect(decision.nextAttempt).toBe(1);
    }
  });

  it('doubles the delay on subsequent retries', () => {
    expect(planRetry(1)).toMatchObject({ status: 'retry', delayMs: 120_000 });
    expect(planRetry(2)).toMatchObject({ status: 'retry', delayMs: 240_000 });
  });

  it('caps the delay at 15 minutes for the last allowed attempt', () => {
    const decision = planRetry(4);

    expect(decision.status).toBe('retry');
    if (decision.status === 'retry') {
      expect(decision.delayMs).toBe(15 * 60_000);
      expect(decision.nextAttempt).toBe(5);
    }
  });

  it('gives up after the 5th attempt', () => {
    expect(planRetry(5).status).toBe('give-up');
  });
});
