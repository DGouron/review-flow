import { describe, it, expect } from 'vitest';
import { Duration } from '../../../entities/shared/duration.valueObject.js';

describe('Duration', () => {
  describe('factory methods', () => {
    it('should create from milliseconds', () => {
      const duration = Duration.fromMilliseconds(5000);
      expect(duration.ms).toBe(5000);
    });

    it('should create from seconds', () => {
      const duration = Duration.fromSeconds(5);
      expect(duration.ms).toBe(5000);
    });

    it('should create from minutes', () => {
      const duration = Duration.fromMinutes(2);
      expect(duration.ms).toBe(120000);
    });

    it('should create zero duration', () => {
      const duration = Duration.zero();
      expect(duration.ms).toBe(0);
    });

    it('should throw for negative milliseconds', () => {
      expect(() => Duration.fromMilliseconds(-100)).toThrow();
    });
  });

  describe('accessors', () => {
    it('should return seconds', () => {
      const duration = Duration.fromMilliseconds(5500);
      expect(duration.seconds).toBe(5);
    });

    it('should return minutes', () => {
      const duration = Duration.fromMilliseconds(125000);
      expect(duration.minutes).toBe(2);
    });
  });

  describe('formatted', () => {
    it('should format minutes and seconds', () => {
      const duration = Duration.fromMilliseconds(125000);
      expect(duration.formatted).toBe('2m 5s');
    });

    it('should format seconds only when under 1 minute', () => {
      const duration = Duration.fromMilliseconds(45000);
      expect(duration.formatted).toBe('45s');
    });

    it('should format minutes only when no seconds', () => {
      const duration = Duration.fromMinutes(3);
      expect(duration.formatted).toBe('3m');
    });

    it('should format zero', () => {
      const duration = Duration.zero();
      expect(duration.formatted).toBe('0s');
    });
  });

  describe('add', () => {
    it('should add two durations', () => {
      const duration1 = Duration.fromSeconds(30);
      const duration2 = Duration.fromSeconds(45);

      const result = duration1.add(duration2);

      expect(result.seconds).toBe(75);
    });
  });

  describe('subtract', () => {
    it('should subtract two durations', () => {
      const duration1 = Duration.fromSeconds(60);
      const duration2 = Duration.fromSeconds(25);

      const result = duration1.subtract(duration2);

      expect(result.seconds).toBe(35);
    });

    it('should return zero when result would be negative', () => {
      const duration1 = Duration.fromSeconds(10);
      const duration2 = Duration.fromSeconds(30);

      const result = duration1.subtract(duration2);

      expect(result.ms).toBe(0);
    });
  });

  describe('isGreaterThan', () => {
    it('should return true when greater', () => {
      const duration1 = Duration.fromSeconds(60);
      const duration2 = Duration.fromSeconds(30);

      expect(duration1.isGreaterThan(duration2)).toBe(true);
    });

    it('should return false when less', () => {
      const duration1 = Duration.fromSeconds(30);
      const duration2 = Duration.fromSeconds(60);

      expect(duration1.isGreaterThan(duration2)).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for same duration', () => {
      const duration1 = Duration.fromSeconds(30);
      const duration2 = Duration.fromMilliseconds(30000);

      expect(duration1.equals(duration2)).toBe(true);
    });

    it('should return false for different durations', () => {
      const duration1 = Duration.fromSeconds(30);
      const duration2 = Duration.fromSeconds(45);

      expect(duration1.equals(duration2)).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should return milliseconds', () => {
      const duration = Duration.fromSeconds(5);
      expect(duration.toJSON()).toBe(5000);
    });
  });

  describe('toString', () => {
    it('should return formatted string', () => {
      const duration = Duration.fromMilliseconds(125000);
      expect(duration.toString()).toBe('2m 5s');
    });
  });
});
