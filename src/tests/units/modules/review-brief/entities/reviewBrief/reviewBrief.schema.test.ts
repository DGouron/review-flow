import { describe, expect, it } from 'vitest';

import {
  reviewBriefGuard,
  reviewBriefModelOutputGuard,
} from '@/modules/review-brief/entities/reviewBrief/reviewBrief.guard.js';
import { ReviewBriefFactory } from '@/tests/factories/reviewBrief.factory.js';

describe('reviewBriefModelOutputGuard', () => {
  it('accepts a complete model output', () => {
    expect(reviewBriefModelOutputGuard.isValid(ReviewBriefFactory.modelOutput())).toBe(true);
  });

  it('rejects an empty what', () => {
    expect(reviewBriefModelOutputGuard.isValid(ReviewBriefFactory.modelOutput({ what: '' }))).toBe(
      false,
    );
  });

  it('rejects a what made only of whitespace', () => {
    expect(
      reviewBriefModelOutputGuard.isValid(ReviewBriefFactory.modelOutput({ what: '   ' })),
    ).toBe(false);
  });

  it('rejects an empty problem', () => {
    expect(
      reviewBriefModelOutputGuard.isValid(ReviewBriefFactory.modelOutput({ problem: '' })),
    ).toBe(false);
  });

  it('rejects zero risks', () => {
    expect(reviewBriefModelOutputGuard.isValid(ReviewBriefFactory.modelOutput({ risks: [] }))).toBe(
      false,
    );
  });

  it('rejects four risks', () => {
    expect(
      reviewBriefModelOutputGuard.isValid(
        ReviewBriefFactory.modelOutput({ risks: ['a', 'b', 'c', 'd'] }),
      ),
    ).toBe(false);
  });

  it('accepts three risks', () => {
    expect(
      reviewBriefModelOutputGuard.isValid(
        ReviewBriefFactory.modelOutput({ risks: ['a', 'b', 'c'] }),
      ),
    ).toBe(true);
  });

  it('rejects zero items to check', () => {
    expect(
      reviewBriefModelOutputGuard.isValid(ReviewBriefFactory.modelOutput({ toCheck: [] })),
    ).toBe(false);
  });

  it('rejects three items to check', () => {
    expect(
      reviewBriefModelOutputGuard.isValid(
        ReviewBriefFactory.modelOutput({ toCheck: ['a', 'b', 'c'] }),
      ),
    ).toBe(false);
  });

  it('accepts no areas', () => {
    expect(reviewBriefModelOutputGuard.isValid(ReviewBriefFactory.modelOutput({ areas: [] }))).toBe(
      true,
    );
  });

  it('rejects six areas', () => {
    expect(
      reviewBriefModelOutputGuard.isValid(
        ReviewBriefFactory.modelOutput({ areas: ['a', 'b', 'c', 'd', 'e', 'f'] }),
      ),
    ).toBe(false);
  });

  it('rejects an area longer than sixty characters', () => {
    expect(
      reviewBriefModelOutputGuard.isValid(
        ReviewBriefFactory.modelOutput({ areas: ['x'.repeat(61)] }),
      ),
    ).toBe(false);
  });

  it('trims the strings it accepts', () => {
    const parsed = reviewBriefModelOutputGuard.parse(
      ReviewBriefFactory.modelOutput({ what: '  Adds taxes  ' }),
    );

    expect(parsed.what).toBe('Adds taxes');
  });

  it('drops keys the brief does not know', () => {
    const parsed = reviewBriefModelOutputGuard.parse({
      ...ReviewBriefFactory.modelOutput(),
      size: { additions: 9999, deletions: 0, changedFiles: 1 },
    });

    expect('size' in parsed).toBe(false);
  });
});

describe('reviewBriefGuard', () => {
  it('accepts a complete brief', () => {
    expect(reviewBriefGuard.isValid(ReviewBriefFactory.create())).toBe(true);
  });

  it('rejects an empty head sha', () => {
    expect(reviewBriefGuard.isValid(ReviewBriefFactory.create({ headSha: '' }))).toBe(false);
  });

  it('rejects a generatedAt that is not an ISO date', () => {
    expect(reviewBriefGuard.isValid(ReviewBriefFactory.create({ generatedAt: 'yesterday' }))).toBe(
      false,
    );
  });

  it('rejects a negative size', () => {
    expect(
      reviewBriefGuard.isValid(
        ReviewBriefFactory.create({ size: { additions: -1, deletions: 0, changedFiles: 1 } }),
      ),
    ).toBe(false);
  });
});
