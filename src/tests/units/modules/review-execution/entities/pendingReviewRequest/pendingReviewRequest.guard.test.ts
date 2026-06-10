import { describe, it, expect } from 'vitest';

import { pendingReviewRequestGuard } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.guard.js';
import { PendingReviewRequestFactory } from '@/tests/factories/pendingReviewRequest.factory.js';

describe('pendingReviewRequestGuard', () => {
  it('accepts a valid pending review request', () => {
    const valid = PendingReviewRequestFactory.create();

    const result = pendingReviewRequestGuard.safeParse(valid);

    expect(result.success).toBe(true);
  });

  it('rejects a request with a missing identifier', () => {
    const invalid = { ...PendingReviewRequestFactory.create(), pendingReviewRequestId: '' };

    const result = pendingReviewRequestGuard.safeParse(invalid);

    expect(result.success).toBe(false);
  });

  it('rejects a request with an unknown trigger source', () => {
    const invalid = {
      ...PendingReviewRequestFactory.create(),
      triggerSource: 'cron-job',
    };

    const result = pendingReviewRequestGuard.safeParse(invalid);

    expect(result.success).toBe(false);
  });

  it('accepts a followup pending request', () => {
    const followup = PendingReviewRequestFactory.create({
      jobType: 'followup',
      triggerSource: 'webhook-followup',
    });

    const result = pendingReviewRequestGuard.safeParse(followup);

    expect(result.success).toBe(true);
  });
});
