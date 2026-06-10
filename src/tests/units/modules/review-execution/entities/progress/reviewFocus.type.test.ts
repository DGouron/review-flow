import { describe, it, expect } from 'vitest';

import {
  DEFAULT_FRONT_AGENTS,
  DEFAULT_BACK_AGENTS,
  DEFAULT_FULLSTACK_AGENTS,
  DEFAULT_DOC_AGENTS,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import {
  isReviewFocus,
  reviewSkillForFocus,
  defaultAgentsForFocus,
  dedupAgents,
  REVIEW_FOCUS_VALUES,
} from '@/modules/review-execution/entities/progress/reviewFocus.type.js';

describe('REVIEW_FOCUS_VALUES', () => {
  it('exposes the four known focus values in declaration order', () => {
    expect(REVIEW_FOCUS_VALUES).toEqual(['front', 'back', 'fullstack', 'doc']);
  });
});

describe('isReviewFocus', () => {
  it('returns true for each declared focus value', () => {
    expect(isReviewFocus('front')).toBe(true);
    expect(isReviewFocus('back')).toBe(true);
    expect(isReviewFocus('fullstack')).toBe(true);
    expect(isReviewFocus('doc')).toBe(true);
  });

  it('returns false for an unknown focus value', () => {
    expect(isReviewFocus('mobile')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isReviewFocus(undefined)).toBe(false);
    expect(isReviewFocus(null)).toBe(false);
    expect(isReviewFocus(42)).toBe(false);
    expect(isReviewFocus({})).toBe(false);
  });
});

describe('reviewSkillForFocus', () => {
  it('maps each focus to its review-{focus} skill name', () => {
    expect(reviewSkillForFocus('front')).toBe('review-front');
    expect(reviewSkillForFocus('back')).toBe('review-back');
    expect(reviewSkillForFocus('fullstack')).toBe('review-fullstack');
    expect(reviewSkillForFocus('doc')).toBe('review-doc');
  });
});

describe('defaultAgentsForFocus', () => {
  it('returns DEFAULT_FRONT_AGENTS for "front"', () => {
    expect(defaultAgentsForFocus('front')).toEqual(DEFAULT_FRONT_AGENTS);
  });

  it('returns DEFAULT_BACK_AGENTS for "back"', () => {
    expect(defaultAgentsForFocus('back')).toEqual(DEFAULT_BACK_AGENTS);
  });

  it('returns DEFAULT_FULLSTACK_AGENTS for "fullstack"', () => {
    expect(defaultAgentsForFocus('fullstack')).toEqual(DEFAULT_FULLSTACK_AGENTS);
  });

  it('returns DEFAULT_DOC_AGENTS for "doc"', () => {
    expect(defaultAgentsForFocus('doc')).toEqual(DEFAULT_DOC_AGENTS);
  });
});

describe('dedupAgents', () => {
  it('preserves order while removing duplicates by name', () => {
    const result = dedupAgents([
      { name: 'a', displayName: 'A' },
      { name: 'b', displayName: 'B' },
      { name: 'a', displayName: 'A (duplicate)' },
      { name: 'c', displayName: 'C' },
    ]);

    expect(result).toEqual([
      { name: 'a', displayName: 'A' },
      { name: 'b', displayName: 'B' },
      { name: 'c', displayName: 'C' },
    ]);
  });

  it('returns an empty array when input is empty', () => {
    expect(dedupAgents([])).toEqual([]);
  });

  it('keeps the first occurrence when a duplicate appears', () => {
    const result = dedupAgents([
      { name: 'a', displayName: 'first' },
      { name: 'a', displayName: 'second' },
    ]);

    expect(result).toEqual([{ name: 'a', displayName: 'first' }]);
  });
});
