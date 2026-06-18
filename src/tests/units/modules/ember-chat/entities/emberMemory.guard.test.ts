import { describe, it, expect } from 'vitest';

import {
  emberMemoryGuard,
  emberRecurringInsightGuard,
} from '@/modules/ember-chat/entities/emberMemory/emberMemory.guard.js';

describe('emberMemoryGuard', () => {
  it('accepts a memory holding conversation turns', () => {
    const result = emberMemoryGuard.safeParse({
      turns: [{ question: 'Quel projet régresse ?', answer: 'Le projet X régresse le vendredi.' }],
    });

    expect(result.success).toBe(true);
  });

  it('accepts an empty memory with no turns', () => {
    const result = emberMemoryGuard.safeParse({ turns: [] });

    expect(result.success).toBe(true);
  });

  it('rejects a turn missing its answer', () => {
    const result = emberMemoryGuard.safeParse({
      turns: [{ question: 'Et le mois dernier ?' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a turn with an empty question', () => {
    const result = emberMemoryGuard.safeParse({
      turns: [{ question: '', answer: 'une réponse' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects data that is not a memory', () => {
    expect(emberMemoryGuard.safeParse('not a memory').success).toBe(false);
    expect(emberMemoryGuard.safeParse(null).success).toBe(false);
  });

  it('accepts a memory holding recurring insights', () => {
    const result = emberMemoryGuard.safeParse({
      turns: [],
      insights: ['Le projet X régresse chaque vendredi.'],
    });

    expect(result.success).toBe(true);
  });

  it('defaults insights to an empty list for a legacy notebook that only has turns', () => {
    const result = emberMemoryGuard.safeParse({ turns: [] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.insights).toEqual([]);
    }
  });

  it('rejects an empty recurring insight', () => {
    const result = emberMemoryGuard.safeParse({ turns: [], insights: [''] });

    expect(result.success).toBe(false);
  });
});

describe('emberRecurringInsightGuard', () => {
  it('accepts a non-empty insight', () => {
    const result = emberRecurringInsightGuard.safeParse('Le projet X régresse chaque vendredi.');

    expect(result.success).toBe(true);
  });

  it('trims a surrounding-whitespace insight to its meaningful content', () => {
    const result = emberRecurringInsightGuard.safeParse('  Régression du vendredi.  ');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('Régression du vendredi.');
    }
  });

  it('rejects a blank insight', () => {
    expect(emberRecurringInsightGuard.safeParse('').success).toBe(false);
    expect(emberRecurringInsightGuard.safeParse('   ').success).toBe(false);
  });

  it('rejects a value that is not a string', () => {
    expect(emberRecurringInsightGuard.safeParse(42).success).toBe(false);
    expect(emberRecurringInsightGuard.safeParse(null).success).toBe(false);
  });
});
