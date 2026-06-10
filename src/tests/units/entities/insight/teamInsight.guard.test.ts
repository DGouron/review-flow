import { describe, it, expect } from 'vitest';

import {
  parseTeamInsight,
  safeParseTeamInsight,
  isValidTeamInsight,
} from '@/modules/statistics-insights/entities/insight/teamInsight.guard.js';
import { TeamInsightFactory } from '@/tests/factories/teamInsight.factory.js';

describe('TeamInsight guard', () => {
  describe('parseTeamInsight', () => {
    it('should return the typed insight for a valid object', () => {
      const valid = TeamInsightFactory.createValid();

      const result = parseTeamInsight(valid);

      expect(result.developerCount).toBe(3);
      expect(result.averageLevels.quality).toBe(6);
      expect(result.strengths).toEqual(['codeVolume']);
    });

    it('should throw with the instigator label for an invalid object', () => {
      expect(() => parseTeamInsight({ developerCount: -1 })).toThrow(/teamInsight/);
    });
  });

  describe('safeParseTeamInsight', () => {
    it('should succeed for a valid object', () => {
      const valid = TeamInsightFactory.createValid();

      const result = safeParseTeamInsight(valid);

      expect(result.success).toBe(true);
    });

    it('should fail when averageLevels is out of bounds', () => {
      const invalid = TeamInsightFactory.create({
        averageLevels: { quality: 11, responsiveness: 5, codeVolume: 7, iteration: 5 },
      });

      const result = safeParseTeamInsight(invalid);

      expect(result.success).toBe(false);
    });
  });

  describe('isValidTeamInsight', () => {
    it('should return true for a valid object', () => {
      const valid = TeamInsightFactory.createValid();

      expect(isValidTeamInsight(valid)).toBe(true);
    });

    it('should return false for an unknown strength category', () => {
      const invalid = TeamInsightFactory.create({ strengths: ['unknownCategory'] });

      expect(isValidTeamInsight(invalid)).toBe(false);
    });

    it('should return false for a non-object input', () => {
      expect(isValidTeamInsight(null)).toBe(false);
    });
  });
});
