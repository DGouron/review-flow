import { describe, expect, it } from 'vitest';

import {
  recordVerdict,
  type VerdictFinding,
} from '@/modules/review-execution/entities/verdict/verdictRecord.js';
import { parseReviewOutput } from '@/modules/statistics-insights/entities/stats/reviewOutput.parser.js';

function finding(overrides: Partial<VerdictFinding> = {}): VerdictFinding {
  return {
    dimension: 'conception',
    severity: 'important',
    ruling: 'maintained',
    origin: 'introduced',
    ...overrides,
  };
}

describe('recordVerdict', () => {
  it('is ready with every dimension at A when nothing was retained', () => {
    const record = recordVerdict({ findings: [] });

    expect(record.verdict).toBe('ready');
    expect(record.grade).toBe('A');
    expect(record.levels).toEqual({
      fiabilite: 'A',
      securite: 'A',
      conception: 'A',
      lisibilite: 'A',
      tests: 'A',
      sante: 'A',
    });
  });

  it('grades each dimension from its worst retained finding', () => {
    const record = recordVerdict({
      findings: [
        finding({ dimension: 'fiabilite', severity: 'blocking' }),
        finding({ dimension: 'lisibilite', severity: 'suggestion' }),
        finding({ dimension: 'lisibilite', severity: 'important' }),
        finding({ dimension: 'tests', severity: 'note' }),
      ],
    });

    expect(record.levels).toMatchObject({ fiabilite: 'D', lisibilite: 'C', tests: 'A' });
    expect(record.grade).toBe('D');
  });

  it('ignores a withdrawn finding and a pre-existing one left out of scope', () => {
    const record = recordVerdict({
      findings: [
        finding({ severity: 'blocking', ruling: 'withdrawn' }),
        finding({ severity: 'important', origin: 'preexisting', ruling: 'out-of-scope' }),
      ],
    });

    expect(record.verdict).toBe('ready');
    expect(record.levels.conception).toBe('A');
  });

  it('asks for changes on a pre-existing finding kept under the boy-scout rule', () => {
    const record = recordVerdict({
      findings: [finding({ severity: 'important', origin: 'preexisting', ruling: 'boy-scout' })],
    });

    expect(record.verdict).toBe('changes');
    expect(record.counts).toEqual({ blocking: 0, warnings: 1, suggestions: 0, preexisting: 1 });
  });

  it('stays ready with suggestions only', () => {
    const record = recordVerdict({ findings: [finding({ severity: 'suggestion' })] });

    expect(record.verdict).toBe('ready');
    expect(record.grade).toBe('B');
  });

  it('takes the code health grade of the tally when it is worse than the findings', () => {
    const record = recordVerdict({ findings: [], health: 'E' });

    expect(record.levels.sante).toBe('E');
    expect(record.grade).toBe('E');
  });

  it.each(['stopped', 'incomplete'] as const)(
    'keeps a %s outcome whatever the findings',
    (outcome) => {
      const record = recordVerdict({ outcome, findings: [] });

      expect(record.verdict).toBe(outcome);
    },
  );

  it('writes a marker the review output parser reads back', () => {
    const record = recordVerdict({
      findings: [
        finding({ dimension: 'conception', severity: 'important' }),
        finding({
          dimension: 'fiabilite',
          severity: 'important',
          origin: 'preexisting',
          ruling: 'boy-scout',
        }),
        finding({ dimension: 'lisibilite', severity: 'suggestion' }),
      ],
      health: 'B',
    });

    expect(record.marker).toBe(
      '[REVIEW_STATS:blocking=0:warnings=2:suggestions=1:preexisting=1:verdict=changes:grade=C:levels=fiabilite=C,securite=A,conception=C,lisibilite=B,tests=A,sante=B]',
    );
    expect(parseReviewOutput(record.marker)).toMatchObject({
      blocking: 0,
      warnings: 2,
      suggestions: 1,
      verdict: 'changes',
      grade: 'C',
      levels: record.levels,
    });
  });
});
