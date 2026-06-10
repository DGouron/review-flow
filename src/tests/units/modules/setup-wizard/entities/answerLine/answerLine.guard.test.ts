import { describe, it, expect } from 'vitest';

import {
  confirmAnswerGuard,
  choiceAnswerGuard,
  multiSelectAnswerGuard,
} from '@/modules/setup-wizard/entities/answerLine/answerLine.guard.js';

describe('confirmAnswerGuard', () => {
  it('accepts a boolean', () => {
    expect(confirmAnswerGuard.isValid(true)).toBe(true);
    expect(confirmAnswerGuard.isValid(false)).toBe(true);
  });

  it('rejects a non-boolean', () => {
    expect(confirmAnswerGuard.isValid('maybe')).toBe(false);
    expect(confirmAnswerGuard.isValid(1)).toBe(false);
  });
});

describe('choiceAnswerGuard', () => {
  it('accepts a string', () => {
    expect(choiceAnswerGuard.isValid('backend')).toBe(true);
  });

  it('rejects a non-string', () => {
    expect(choiceAnswerGuard.isValid(42)).toBe(false);
    expect(choiceAnswerGuard.isValid(['backend'])).toBe(false);
  });
});

describe('multiSelectAnswerGuard', () => {
  it('accepts an array of strings', () => {
    expect(multiSelectAnswerGuard.isValid(['solid', 'testing'])).toBe(true);
    expect(multiSelectAnswerGuard.isValid([])).toBe(true);
  });

  it('rejects a value that is not an array of strings', () => {
    expect(multiSelectAnswerGuard.isValid('solid')).toBe(false);
    expect(multiSelectAnswerGuard.isValid([1, 2])).toBe(false);
  });
});
