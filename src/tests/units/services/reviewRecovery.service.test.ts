import { describe, expect, it } from 'vitest';

import { shouldRecover } from '@/modules/review-execution/services/reviewRecovery.service.js';
import { ReviewContextFactory } from '@/tests/factories/reviewContext.factory.js';

describe('shouldRecover', () => {
  it('returns true when Claude completed but post-actions never ran', () => {
    const context = ReviewContextFactory.create({
      progress: { phase: 'completed', currentStep: null },
      actions: [{ type: 'POST_COMMENT', body: 'global review' }],
    });

    expect(shouldRecover(context)).toBe(true);
  });

  it('returns false when result is already set (already finalized)', () => {
    const context = ReviewContextFactory.create({
      progress: { phase: 'completed', currentStep: null },
      actions: [{ type: 'POST_COMMENT', body: 'global review' }],
      result: {
        kind: 'measured',
        blocking: 0,
        warnings: 2,
        suggestions: 3,
        score: 8,
        verdict: 'needs_discussion',
      },
    });

    expect(shouldRecover(context)).toBe(false);
  });

  it('returns false when completed but no actions queued', () => {
    const context = ReviewContextFactory.create({
      progress: { phase: 'completed', currentStep: null },
      actions: [],
    });

    expect(shouldRecover(context)).toBe(false);
  });

  it('returns false while Claude is still running (phase=agents-running)', () => {
    const context = ReviewContextFactory.create({
      progress: { phase: 'agents-running', currentStep: 'solid' },
      actions: [{ type: 'POST_INLINE_COMMENT', filePath: 'a.ts', line: 1, body: 'x' }],
    });

    expect(shouldRecover(context)).toBe(false);
  });

  it('returns false for a freshly created pending context', () => {
    const context = ReviewContextFactory.create({
      progress: { phase: 'pending', currentStep: null },
      actions: [],
    });

    expect(shouldRecover(context)).toBe(false);
  });
});
