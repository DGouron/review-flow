import { describe, it, expect } from 'vitest';

import { evaluateQualityGate } from '@/modules/tracking/entities/qualityGate/qualityGate.js';

describe('evaluateQualityGate', () => {
  it('allows transition when latestScore is null (no review yet)', () => {
    const result = evaluateQualityGate({ latestScore: null, blockingIssues: 0, threshold: 7 });

    expect(result.allowed).toBe(true);
  });

  it('allows transition when threshold is null (backward compatibility)', () => {
    const result = evaluateQualityGate({ latestScore: 4, blockingIssues: 0, threshold: null });

    expect(result.allowed).toBe(true);
  });

  it('rejects transition when blocking issues are present', () => {
    const result = evaluateQualityGate({ latestScore: 9, blockingIssues: 2, threshold: 7 });

    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe('blockers-present');
    expect(result.message).toBe('Issues bloquantes non résolues');
  });

  it('rejects transition when score is below threshold', () => {
    const result = evaluateQualityGate({ latestScore: 6, blockingIssues: 0, threshold: 7 });

    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe('below-threshold');
    expect(result.message).toBe('Seuil qualité non atteint (6/10 < 7/10)');
  });

  it('allows transition when score is exactly at threshold', () => {
    const result = evaluateQualityGate({ latestScore: 7, blockingIssues: 0, threshold: 7 });

    expect(result.allowed).toBe(true);
  });

  it('allows transition when score is above threshold and no blockers', () => {
    const result = evaluateQualityGate({ latestScore: 8, blockingIssues: 0, threshold: 7 });

    expect(result.allowed).toBe(true);
  });

  it('allows transition when threshold is null even with blockers (gate fully disabled)', () => {
    const result = evaluateQualityGate({ latestScore: 9, blockingIssues: 1, threshold: null });

    expect(result.allowed).toBe(true);
  });

  it('prioritises blocker rejection over below-threshold rejection', () => {
    const result = evaluateQualityGate({ latestScore: 3, blockingIssues: 2, threshold: 7 });

    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe('blockers-present');
  });

  it('allows transition when threshold is 0 and no blockers', () => {
    const result = evaluateQualityGate({ latestScore: 0, blockingIssues: 0, threshold: 0 });

    expect(result.allowed).toBe(true);
  });
});
