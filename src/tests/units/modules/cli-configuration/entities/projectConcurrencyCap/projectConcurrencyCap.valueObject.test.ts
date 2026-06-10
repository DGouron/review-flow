import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROJECT_CONCURRENCY_CAP,
  MAX_PROJECT_CONCURRENCY_CAP,
  MIN_PROJECT_CONCURRENCY_CAP,
  PROJECT_CAP_NOT_INTEGER_MESSAGE,
  PROJECT_CAP_OUT_OF_RANGE_MESSAGE,
  PROJECT_CAP_REQUIRED_MESSAGE,
  effectiveProjectConcurrencyCap,
  validateProjectConcurrencyCap,
} from '@/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.js';

describe('projectConcurrencyCap value object — constants', () => {
  it('exposes the documented numeric range and default', () => {
    expect(MIN_PROJECT_CONCURRENCY_CAP).toBe(1);
    expect(MAX_PROJECT_CONCURRENCY_CAP).toBe(10);
    expect(DEFAULT_PROJECT_CONCURRENCY_CAP).toBe(2);
  });
});

describe('validateProjectConcurrencyCap', () => {
  it('accepts every integer in the inclusive range 1..10', () => {
    for (let value = 1; value <= 10; value += 1) {
      const result = validateProjectConcurrencyCap(value);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(value);
    }
  });

  it('rejects null with the required message', () => {
    expect(validateProjectConcurrencyCap(null)).toEqual({
      ok: false,
      reason: PROJECT_CAP_REQUIRED_MESSAGE,
    });
  });

  it('rejects undefined with the required message', () => {
    expect(validateProjectConcurrencyCap(undefined)).toEqual({
      ok: false,
      reason: PROJECT_CAP_REQUIRED_MESSAGE,
    });
  });

  it('rejects the empty string with the required message', () => {
    expect(validateProjectConcurrencyCap('')).toEqual({
      ok: false,
      reason: PROJECT_CAP_REQUIRED_MESSAGE,
    });
  });

  it('rejects non-numeric values with the integer message', () => {
    expect(validateProjectConcurrencyCap('abc')).toEqual({
      ok: false,
      reason: PROJECT_CAP_NOT_INTEGER_MESSAGE,
    });
  });

  it('rejects non-integer numbers with the integer message', () => {
    expect(validateProjectConcurrencyCap(2.5)).toEqual({
      ok: false,
      reason: PROJECT_CAP_NOT_INTEGER_MESSAGE,
    });
  });

  it('rejects 0 with the range message', () => {
    expect(validateProjectConcurrencyCap(0)).toEqual({
      ok: false,
      reason: PROJECT_CAP_OUT_OF_RANGE_MESSAGE,
    });
  });

  it('rejects -1 with the range message', () => {
    expect(validateProjectConcurrencyCap(-1)).toEqual({
      ok: false,
      reason: PROJECT_CAP_OUT_OF_RANGE_MESSAGE,
    });
  });

  it('rejects 11 with the range message', () => {
    expect(validateProjectConcurrencyCap(11)).toEqual({
      ok: false,
      reason: PROJECT_CAP_OUT_OF_RANGE_MESSAGE,
    });
  });
});

describe('effectiveProjectConcurrencyCap', () => {
  it('returns the explicit value when valid', () => {
    expect(effectiveProjectConcurrencyCap({ maxConcurrentReviews: 5 })).toBe(5);
  });

  it('falls back to default when the field is missing', () => {
    expect(effectiveProjectConcurrencyCap({})).toBe(DEFAULT_PROJECT_CONCURRENCY_CAP);
  });

  it('falls back to default when the field is null', () => {
    expect(effectiveProjectConcurrencyCap({ maxConcurrentReviews: null })).toBe(
      DEFAULT_PROJECT_CONCURRENCY_CAP,
    );
  });

  it('falls back to default when the value is out of range', () => {
    expect(effectiveProjectConcurrencyCap({ maxConcurrentReviews: 99 })).toBe(
      DEFAULT_PROJECT_CONCURRENCY_CAP,
    );
  });

  it('falls back to default when the value is a non-integer', () => {
    expect(effectiveProjectConcurrencyCap({ maxConcurrentReviews: 2.5 })).toBe(
      DEFAULT_PROJECT_CONCURRENCY_CAP,
    );
  });
});
