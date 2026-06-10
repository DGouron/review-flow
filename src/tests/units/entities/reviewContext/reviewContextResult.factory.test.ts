import { describe, expect, it } from 'vitest';

import { ReviewContextResultFactory } from '@/modules/review-execution/entities/reviewContext/reviewContextResult.factory.js';

describe('ReviewContextResultFactory.fromParsedReview', () => {
  it("returns verdict 'needs_fixes' whenever blocking > 0, regardless of score", () => {
    const result = ReviewContextResultFactory.fromParsedReview({
      score: 10,
      blocking: 1,
      warnings: 0,
      suggestions: 0,
    });

    expect(result.kind).toBe('measured');
    expect(result.verdict).toBe('needs_fixes');
  });

  it("returns verdict 'ready_to_merge' on a clean score >= 8 with no warnings", () => {
    const result = ReviewContextResultFactory.fromParsedReview({
      score: 9,
      blocking: 0,
      warnings: 0,
      suggestions: 2,
    });

    expect(result.verdict).toBe('ready_to_merge');
  });

  it("falls back to 'needs_discussion' when score is null", () => {
    const result = ReviewContextResultFactory.fromParsedReview({
      score: null,
      blocking: 0,
      warnings: 0,
      suggestions: 0,
    });

    expect(result.score).toBe(0);
    expect(result.verdict).toBe('needs_discussion');
  });

  it("returns 'needs_discussion' when warnings present but no blocking", () => {
    const result = ReviewContextResultFactory.fromParsedReview({
      score: 9,
      blocking: 0,
      warnings: 1,
      suggestions: 0,
    });

    expect(result.verdict).toBe('needs_discussion');
  });
});
