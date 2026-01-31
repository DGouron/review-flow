import { describe, it, expect } from 'vitest';
import { ReviewScore } from '../../../domain/review/reviewScore.valueObject.js';

describe('ReviewScore', () => {
  describe('create', () => {
    it('should create from valid props', () => {
      const score = ReviewScore.create({ blocking: 1, warnings: 2, suggestions: 3 });
      expect(score.blocking).toBe(1);
      expect(score.warnings).toBe(2);
      expect(score.suggestions).toBe(3);
    });

    it('should throw for negative values', () => {
      expect(() => ReviewScore.create({ blocking: -1, warnings: 0, suggestions: 0 })).toThrow();
    });
  });

  describe('zero', () => {
    it('should create score with all zeros', () => {
      const score = ReviewScore.zero();
      expect(score.blocking).toBe(0);
      expect(score.warnings).toBe(0);
      expect(score.suggestions).toBe(0);
    });
  });

  describe('total', () => {
    it('should sum all values', () => {
      const score = ReviewScore.create({ blocking: 1, warnings: 2, suggestions: 3 });
      expect(score.total).toBe(6);
    });
  });

  describe('severity', () => {
    it('should return critical when blocking > 0', () => {
      const score = ReviewScore.create({ blocking: 2, warnings: 1, suggestions: 0 });
      expect(score.severity).toBe('critical');
    });

    it('should return warning when only warnings', () => {
      const score = ReviewScore.create({ blocking: 0, warnings: 3, suggestions: 0 });
      expect(score.severity).toBe('warning');
    });

    it('should return info when only suggestions', () => {
      const score = ReviewScore.create({ blocking: 0, warnings: 0, suggestions: 5 });
      expect(score.severity).toBe('info');
    });

    it('should return clean when all zero', () => {
      const score = ReviewScore.zero();
      expect(score.severity).toBe('clean');
    });
  });

  describe('isClean', () => {
    it('should return true when total is 0', () => {
      const score = ReviewScore.zero();
      expect(score.isClean).toBe(true);
    });

    it('should return false when has issues', () => {
      const score = ReviewScore.create({ blocking: 0, warnings: 1, suggestions: 0 });
      expect(score.isClean).toBe(false);
    });
  });

  describe('hasBlockingIssues', () => {
    it('should return true when blocking > 0', () => {
      const score = ReviewScore.create({ blocking: 1, warnings: 0, suggestions: 0 });
      expect(score.hasBlockingIssues).toBe(true);
    });

    it('should return false when blocking is 0', () => {
      const score = ReviewScore.create({ blocking: 0, warnings: 5, suggestions: 10 });
      expect(score.hasBlockingIssues).toBe(false);
    });
  });

  describe('add', () => {
    it('should add two scores', () => {
      const score1 = ReviewScore.create({ blocking: 1, warnings: 2, suggestions: 3 });
      const score2 = ReviewScore.create({ blocking: 2, warnings: 3, suggestions: 4 });

      const result = score1.add(score2);

      expect(result.blocking).toBe(3);
      expect(result.warnings).toBe(5);
      expect(result.suggestions).toBe(7);
    });
  });

  describe('toString', () => {
    it('should format as B/W/S', () => {
      const score = ReviewScore.create({ blocking: 1, warnings: 2, suggestions: 3 });
      expect(score.toString()).toBe('1B/2W/3S');
    });
  });

  describe('toJSON', () => {
    it('should return props object', () => {
      const score = ReviewScore.create({ blocking: 1, warnings: 2, suggestions: 3 });
      expect(score.toJSON()).toEqual({ blocking: 1, warnings: 2, suggestions: 3 });
    });
  });
});
