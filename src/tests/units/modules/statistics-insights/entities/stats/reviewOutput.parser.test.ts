import { describe, it, expect } from 'vitest';

import { parseReviewOutput } from '@/modules/statistics-insights/entities/stats/reviewOutput.parser.js';

describe('parseReviewOutput structured stats line', () => {
  it('parses a full structured stats line', () => {
    const result = parseReviewOutput(
      '[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]',
    );

    expect(result).toEqual({
      score: 7.5,
      blocking: 1,
      warnings: 2,
      suggestions: 3,
      categoryBreakdown: null,
      verdict: 'changes',
      grade: 'D',
      levels: null,
    });
  });

  it('leaves defaults when structured fields are partially absent', () => {
    const result = parseReviewOutput('[REVIEW_STATS:blocking=4]');

    expect(result).toEqual({
      score: null,
      blocking: 4,
      warnings: 0,
      suggestions: 0,
      categoryBreakdown: null,
      verdict: 'changes',
      grade: 'D',
      levels: null,
    });
  });
});

describe('parseReviewOutput summary format', () => {
  it('parses the summary format with score, blocking, warnings and suggestions', () => {
    const stdout = [
      'Score global : 8/10',
      '🚨 Bloquants : 2',
      '⚠️ Importants : 3',
      '💡 Suggestions : 4',
    ].join('\n');

    const result = parseReviewOutput(stdout);

    expect(result).toEqual({
      score: 8,
      blocking: 2,
      warnings: 3,
      suggestions: 4,
      categoryBreakdown: null,
      verdict: 'changes',
      grade: 'D',
      levels: null,
    });
  });

  it('returns summary results when only the score is present alongside a blocking summary line', () => {
    const result = parseReviewOutput('Score global : 6.5/10\n🚨 Bloquant : 1');

    expect(result.score).toBe(6.5);
    expect(result.blocking).toBe(1);
    expect(result.warnings).toBe(0);
    expect(result.suggestions).toBe(0);
  });
});

describe('parseReviewOutput inline markers fallback', () => {
  it('falls back to counting inline markers when no summary lines exist', () => {
    const stdout = [
      '🚨 [BLOQUANT] first',
      '🚨 [BLOQUANT] second',
      '⚠️ [IMPORTANT] one',
      '💡 [SUGGESTION] tip',
    ].join('\n');

    const result = parseReviewOutput(stdout);

    expect(result).toEqual({
      score: null,
      blocking: 2,
      warnings: 1,
      suggestions: 1,
      categoryBreakdown: null,
      verdict: null,
      grade: null,
      levels: null,
    });
  });

  it('reaches the section-header branches without lowering inline marker counts', () => {
    const stdout = [
      '🚨 [BLOQUANT] inline blocker',
      '## Corrections Bloquantes',
      'narrative only, no numbered headers',
      '⚠️ [IMPORTANT] inline warning',
      '## Corrections Importantes',
      'narrative only',
      '💡 [SUGGESTION] inline suggestion',
      '## Suggestions',
      'narrative only',
    ].join('\n');

    const result = parseReviewOutput(stdout);

    expect(result.blocking).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.suggestions).toBe(1);
  });
});

describe('parseReviewOutput empty / no match', () => {
  it('returns all zeros and null score when nothing matches', () => {
    const result = parseReviewOutput('a review with no recognizable markers at all');

    expect(result).toEqual({
      score: null,
      blocking: 0,
      warnings: 0,
      suggestions: 0,
      categoryBreakdown: null,
      verdict: null,
      grade: null,
      levels: null,
    });
  });

  it('returns all zeros and null score for empty output', () => {
    const result = parseReviewOutput('');

    expect(result).toEqual({
      score: null,
      blocking: 0,
      warnings: 0,
      suggestions: 0,
      categoryBreakdown: null,
      verdict: null,
      grade: null,
      levels: null,
    });
  });
});

describe('parseReviewOutput category segment', () => {
  const marker = (categories: string): string =>
    `[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:score=8:categories=${categories}]`;

  it('returns a normalized breakdown from the categories segment', () => {
    const parsed = parseReviewOutput(marker('security=3,logic=5,performance=1'));

    expect(parsed.categoryBreakdown).toEqual({
      security: 3,
      logic: 5,
      performance: 1,
      typeSafety: 0,
      style: 0,
      dependencies: 0,
    });
  });

  it('drops unknown categories from the segment', () => {
    const parsed = parseReviewOutput(marker('security=2,cosmic=9'));

    expect(parsed.categoryBreakdown).toEqual({
      security: 2,
      logic: 0,
      performance: 0,
      typeSafety: 0,
      style: 0,
      dependencies: 0,
    });
  });

  it('returns null breakdown when the marker has no categories segment', () => {
    const parsed = parseReviewOutput('[REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7]');

    expect(parsed.categoryBreakdown).toBeNull();
  });
});

describe('parseReviewOutput verdict and levels', () => {
  it('reads the verdict, the grade and the levels of the stats line', () => {
    const parsed = parseReviewOutput(
      '[REVIEW_STATS:blocking=0:warnings=4:suggestions=3:preexisting=1:verdict=changes:grade=C:levels=fiabilite=C,securite=A,tests=B]',
    );

    expect(parsed.verdict).toBe('changes');
    expect(parsed.grade).toBe('C');
    expect(parsed.levels).toEqual({ fiabilite: 'C', securite: 'A', tests: 'B' });
  });

  it('keeps a stopped verdict even without any finding', () => {
    const parsed = parseReviewOutput(
      '[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:verdict=stopped]',
    );

    expect(parsed.verdict).toBe('stopped');
  });

  it('takes the worst level as the grade when the line gives none', () => {
    const parsed = parseReviewOutput(
      '[REVIEW_STATS:blocking=0:warnings=0:suggestions=1:verdict=ready:levels=fiabilite=A,sante=B]',
    );

    expect(parsed.grade).toBe('B');
  });

  it('rebuilds the verdict and the grade of a review written before verdicts', () => {
    const parsed = parseReviewOutput('[REVIEW_STATS:blocking=0:warnings=0:suggestions=2:score=9]');

    expect(parsed.verdict).toBe('ready');
    expect(parsed.grade).toBe('B');
    expect(parsed.levels).toBeNull();
  });

  it('rebuilds the verdict when the line carries an unknown one', () => {
    const parsed = parseReviewOutput(
      '[REVIEW_STATS:blocking=0:warnings=1:suggestions=0:verdict=maybe]',
    );

    expect(parsed.verdict).toBe('changes');
  });

  it('drops a level outside the scale', () => {
    const parsed = parseReviewOutput(
      '[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:verdict=ready:levels=fiabilite=Z,tests=A]',
    );

    expect(parsed.levels).toEqual({ tests: 'A' });
  });
});
