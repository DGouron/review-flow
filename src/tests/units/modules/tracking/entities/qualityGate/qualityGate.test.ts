import { describe, it, expect } from 'vitest';

import { evaluateQualityGate } from '@/modules/tracking/entities/qualityGate/qualityGate.js';

describe('evaluateQualityGate', () => {
  it('allows a ready review whose grade meets the threshold', () => {
    const result = evaluateQualityGate({
      verdict: 'ready',
      grade: 'B',
      blockingIssues: 0,
      threshold: 'B',
    });

    expect(result.allowed).toBe(true);
  });

  it('allows anything when the project sets no threshold (gate fully disabled)', () => {
    const result = evaluateQualityGate({
      verdict: null,
      grade: null,
      blockingIssues: 1,
      threshold: null,
    });

    expect(result.allowed).toBe(true);
  });

  it('refuses a merge request whose review gave no verdict', () => {
    const result = evaluateQualityGate({
      verdict: null,
      grade: null,
      blockingIssues: 0,
      threshold: 'B',
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'verdict-missing',
      message: 'Aucun verdict de review : approbation impossible',
    });
  });

  it('refuses while blocking issues are still open', () => {
    const result = evaluateQualityGate({
      verdict: 'ready',
      grade: 'A',
      blockingIssues: 2,
      threshold: 'B',
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'blockers-present',
      message: 'Issues bloquantes non résolues',
    });
  });

  it.each([
    ['changes', 'à reprendre'],
    ['stopped', 'stoppée'],
    ['incomplete', 'incomplète'],
  ] as const)('refuses a review whose verdict is %s', (verdict, label) => {
    const result = evaluateQualityGate({ verdict, grade: 'A', blockingIssues: 0, threshold: 'D' });

    expect(result).toEqual({
      allowed: false,
      reason: 'not-ready',
      message: `Review ${label} : approbation impossible`,
    });
  });

  it('refuses a ready review whose grade is worse than the threshold', () => {
    const result = evaluateQualityGate({
      verdict: 'ready',
      grade: 'B',
      blockingIssues: 0,
      threshold: 'A',
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'below-threshold',
      message: 'Niveau qualité non atteint (B, seuil A)',
    });
  });

  it('refuses blockers before judging the verdict', () => {
    const result = evaluateQualityGate({
      verdict: 'changes',
      grade: 'D',
      blockingIssues: 2,
      threshold: 'B',
    });

    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe('blockers-present');
  });
});
