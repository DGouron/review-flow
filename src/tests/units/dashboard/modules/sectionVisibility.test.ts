import { describe, expect, it } from 'vitest';

import {
  shouldHideActiveReviewsSection,
  shouldHidePendingReviewsSection,
} from '@/dashboard/modules/sectionVisibility.js';

describe('shouldHidePendingReviewsSection', () => {
  it('returns true when pendingReviews is an empty array', () => {
    expect(shouldHidePendingReviewsSection({ pendingReviews: [] })).toBe(true);
  });

  it('returns true when pendingReviews is null', () => {
    expect(shouldHidePendingReviewsSection({ pendingReviews: null })).toBe(true);
  });

  it('returns true when the pendingReviews key is missing', () => {
    expect(shouldHidePendingReviewsSection({})).toBe(true);
  });

  it('returns false when pendingReviews has at least one entry', () => {
    expect(shouldHidePendingReviewsSection({ pendingReviews: [{ id: 'p1' }] })).toBe(false);
  });
});

describe('shouldHideActiveReviewsSection', () => {
  it('returns true when activeReviews is an empty array', () => {
    expect(shouldHideActiveReviewsSection({ activeReviews: [] })).toBe(true);
  });

  it('returns true when activeReviews contains only a single followup', () => {
    expect(
      shouldHideActiveReviewsSection({
        activeReviews: [{ id: 'r1', jobType: 'followup' }],
      }),
    ).toBe(true);
  });

  it('returns true when activeReviews contains multiple followups only', () => {
    expect(
      shouldHideActiveReviewsSection({
        activeReviews: [
          { id: 'r1', jobType: 'followup' },
          { id: 'r2', jobType: 'followup' },
          { id: 'r3', jobType: 'followup' },
        ],
      }),
    ).toBe(true);
  });

  it('returns false when activeReviews contains one non-followup review', () => {
    expect(
      shouldHideActiveReviewsSection({
        activeReviews: [{ id: 'r1', jobType: 'review' }],
      }),
    ).toBe(false);
  });

  it('returns false when activeReviews mixes followups and a non-followup', () => {
    expect(
      shouldHideActiveReviewsSection({
        activeReviews: [
          { id: 'r1', jobType: 'followup' },
          { id: 'r2', jobType: 'review' },
        ],
      }),
    ).toBe(false);
  });

  it('returns false when an entry has no jobType (treated as non-followup)', () => {
    expect(
      shouldHideActiveReviewsSection({
        activeReviews: [{ id: 'r1' }],
      }),
    ).toBe(false);
  });

  it('returns true when activeReviews is null or missing', () => {
    expect(shouldHideActiveReviewsSection({ activeReviews: null })).toBe(true);
    expect(shouldHideActiveReviewsSection({})).toBe(true);
  });
});
