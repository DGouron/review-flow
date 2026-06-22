import { describe, it, expect } from 'vitest';

import { evaluateDiffSizeGate } from '@/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.js';

describe('evaluateDiffSizeGate', () => {
  it('excludes lockfiles from the counted size', () => {
    const result = evaluateDiffSizeGate({
      files: [
        { path: 'yarn.lock', additions: 5000, deletions: 0 },
        { path: 'src/a.ts', additions: 30, deletions: 0 },
      ],
      budget: 2000,
    });

    expect(result.countedLines).toBe(30);
    expect(result.oversized).toBe(false);
  });

  it('excludes package.json from the counted size', () => {
    const result = evaluateDiffSizeGate({
      files: [
        { path: 'package.json', additions: 3000, deletions: 0 },
        { path: 'src/a.ts', additions: 10, deletions: 0 },
      ],
      budget: 2000,
    });

    expect(result.countedLines).toBe(10);
    expect(result.oversized).toBe(false);
  });

  it('excludes a lockfile referenced by a nested path (matched by basename)', () => {
    const result = evaluateDiffSizeGate({
      files: [
        { path: 'frontend/yarn.lock', additions: 4000, deletions: 0 },
        { path: 'src/a.ts', additions: 20, deletions: 5 },
      ],
      budget: 2000,
    });

    expect(result.countedLines).toBe(25);
  });

  it('sums additions and deletions over counted files', () => {
    const result = evaluateDiffSizeGate({
      files: [
        { path: 'src/a.ts', additions: 50, deletions: 10 },
        { path: 'src/b.ts', additions: 5, deletions: 5 },
      ],
      budget: 2000,
    });

    expect(result.countedLines).toBe(70);
  });

  it('is not oversized when the counted size equals the budget', () => {
    const result = evaluateDiffSizeGate({
      files: [{ path: 'src/a.ts', additions: 2000, deletions: 0 }],
      budget: 2000,
    });

    expect(result.oversized).toBe(false);
  });

  it('is oversized when the counted size is strictly greater than the budget', () => {
    const result = evaluateDiffSizeGate({
      files: [{ path: 'src/a.ts', additions: 2000, deletions: 1 }],
      budget: 2000,
    });

    expect(result.oversized).toBe(true);
    expect(result.countedLines).toBe(2001);
  });

  it('returns zero counted lines for an empty file list', () => {
    const result = evaluateDiffSizeGate({ files: [], budget: 2000 });

    expect(result.countedLines).toBe(0);
    expect(result.oversized).toBe(false);
  });
});
