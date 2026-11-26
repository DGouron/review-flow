import { describe, expect, it } from 'vitest';

import {
  gradeOfCounts,
  gradeOfLegacyThreshold,
  isGradeWithin,
  parseQualityGrade,
  parseReviewVerdict,
  qualityThresholdOf,
  verdictOfCounts,
  worstGrade,
} from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';

describe('verdictOfCounts', () => {
  it('reads a review without blocking nor important finding as ready', () => {
    expect(verdictOfCounts({ blocking: 0, warnings: 0 })).toBe('ready');
  });

  it('reads a review with an important finding as changes', () => {
    expect(verdictOfCounts({ blocking: 0, warnings: 1 })).toBe('changes');
  });

  it('reads a review with a blocking finding as changes', () => {
    expect(verdictOfCounts({ blocking: 1, warnings: 0 })).toBe('changes');
  });
});

describe('gradeOfCounts', () => {
  it('grades A when nothing was retained', () => {
    expect(gradeOfCounts({ blocking: 0, warnings: 0, suggestions: 0 })).toBe('A');
  });

  it('grades B when suggestions are the worst finding', () => {
    expect(gradeOfCounts({ blocking: 0, warnings: 0, suggestions: 2 })).toBe('B');
  });

  it('grades C when an important finding was retained', () => {
    expect(gradeOfCounts({ blocking: 0, warnings: 1, suggestions: 2 })).toBe('C');
  });

  it('grades D when a blocking finding was retained', () => {
    expect(gradeOfCounts({ blocking: 1, warnings: 1, suggestions: 2 })).toBe('D');
  });
});

describe('worstGrade', () => {
  it('keeps the worst letter of the dimensions', () => {
    expect(worstGrade(['B', 'A', 'C', 'B'])).toBe('C');
  });

  it('has no grade without dimensions', () => {
    expect(worstGrade([])).toBeNull();
  });
});

describe('isGradeWithin', () => {
  it('accepts a grade equal to the threshold', () => {
    expect(isGradeWithin('B', 'B')).toBe(true);
  });

  it('accepts a grade better than the threshold', () => {
    expect(isGradeWithin('A', 'B')).toBe(true);
  });

  it('refuses a grade worse than the threshold', () => {
    expect(isGradeWithin('C', 'B')).toBe(false);
  });
});

describe('gradeOfLegacyThreshold', () => {
  it.each([
    [10, 'A'],
    [9, 'B'],
    [8, 'B'],
    [7, 'C'],
    [6, 'C'],
    [5, 'D'],
    [4, 'D'],
    [3, 'E'],
    [0, 'E'],
  ] as const)('converts a threshold of %i/10 to %s', (score, grade) => {
    expect(gradeOfLegacyThreshold(score)).toBe(grade);
  });
});

describe('parseQualityGrade', () => {
  it('reads a letter, whatever its case', () => {
    expect(parseQualityGrade('c')).toBe('C');
  });

  it('refuses a letter outside the scale', () => {
    expect(parseQualityGrade('F')).toBeNull();
  });
});

describe('parseReviewVerdict', () => {
  it('reads a known verdict', () => {
    expect(parseReviewVerdict('incomplete')).toBe('incomplete');
  });

  it('refuses an unknown verdict', () => {
    expect(parseReviewVerdict('maybe')).toBeNull();
  });
});

describe('qualityThresholdOf', () => {
  it('reads a grade letter', () => {
    expect(qualityThresholdOf('b')).toBe('B');
  });

  it('converts a legacy threshold out of 10', () => {
    expect(qualityThresholdOf(9)).toBe('B');
  });

  it.each([11, -1, 7.5, 'F', true])('refuses %s', (value) => {
    expect(qualityThresholdOf(value)).toBeNull();
  });
});
