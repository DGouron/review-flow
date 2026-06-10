import { describe, expect, it } from 'vitest';

import { projectConcurrencyCapGuard } from '@/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.guard.js';

describe('projectConcurrencyCapGuard', () => {
  it('isValid returns true for integers within [1, 10]', () => {
    expect(projectConcurrencyCapGuard.isValid(1)).toBe(true);
    expect(projectConcurrencyCapGuard.isValid(5)).toBe(true);
    expect(projectConcurrencyCapGuard.isValid(10)).toBe(true);
  });

  it('isValid returns false outside the range', () => {
    expect(projectConcurrencyCapGuard.isValid(0)).toBe(false);
    expect(projectConcurrencyCapGuard.isValid(11)).toBe(false);
    expect(projectConcurrencyCapGuard.isValid(2.5)).toBe(false);
    expect(projectConcurrencyCapGuard.isValid('abc')).toBe(false);
  });

  it('parse returns the validated value', () => {
    expect(projectConcurrencyCapGuard.parse(4)).toBe(4);
  });

  it('parse throws on invalid input', () => {
    expect(() => projectConcurrencyCapGuard.parse(11)).toThrow(/projectConcurrencyCap/);
  });
});
