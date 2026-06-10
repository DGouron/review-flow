import { describe, it, expect } from 'vitest';

import {
  parseDeveloperInsight,
  safeParseDeveloperInsight,
  isValidDeveloperInsight,
} from '@/modules/statistics-insights/entities/insight/developerInsight.guard.js';
import { DeveloperInsightFactory } from '@/tests/factories/developerInsight.factory.js';

describe('parseDeveloperInsight', () => {
  it('returns the parsed insight for valid data', () => {
    const valid = DeveloperInsightFactory.createValid();

    const result = parseDeveloperInsight(valid);

    expect(result).toEqual(valid);
  });

  it('throws for invalid data', () => {
    const invalid = DeveloperInsightFactory.create({ developerName: '' });

    expect(() => parseDeveloperInsight(invalid)).toThrow('[developerInsight]');
  });
});

describe('safeParseDeveloperInsight', () => {
  it('succeeds for valid data', () => {
    const valid = DeveloperInsightFactory.createValid();

    const result = safeParseDeveloperInsight(valid);

    expect(result.success).toBe(true);
  });

  it('fails for an out-of-range overallLevel', () => {
    const invalid = DeveloperInsightFactory.create({ overallLevel: 11 });

    const result = safeParseDeveloperInsight(invalid);

    expect(result.success).toBe(false);
  });

  it('fails when a required field is missing', () => {
    const result = safeParseDeveloperInsight({ developerName: 'alice' });

    expect(result.success).toBe(false);
  });
});

describe('isValidDeveloperInsight', () => {
  it('returns true for valid data', () => {
    const valid = DeveloperInsightFactory.createValid();

    expect(isValidDeveloperInsight(valid)).toBe(true);
  });

  it('returns true when topPriority is null', () => {
    const valid = DeveloperInsightFactory.createValid({ topPriority: null });

    expect(isValidDeveloperInsight(valid)).toBe(true);
  });

  it('returns false for a non-object', () => {
    expect(isValidDeveloperInsight(null)).toBe(false);
    expect(isValidDeveloperInsight('alice')).toBe(false);
  });

  it('returns false for a negative reviewCount', () => {
    const invalid = DeveloperInsightFactory.create({ reviewCount: -1 });

    expect(isValidDeveloperInsight(invalid)).toBe(false);
  });
});
