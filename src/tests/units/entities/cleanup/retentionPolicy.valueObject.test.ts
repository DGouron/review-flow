import { describe, it, expect } from 'vitest';

import { RetentionPolicy } from '@/modules/data-lifecycle/entities/cleanup/retentionPolicy.valueObject.js';

describe('RetentionPolicy', () => {
  it('should create with default 14 days', () => {
    const policy = RetentionPolicy.create();

    expect(policy.days).toBe(14);
  });

  it('should create with custom retention days', () => {
    const policy = RetentionPolicy.create(30);

    expect(policy.days).toBe(30);
  });

  it('should reject zero days', () => {
    expect(() => RetentionPolicy.create(0)).toThrow();
  });

  it('should reject negative days', () => {
    expect(() => RetentionPolicy.create(-5)).toThrow();
  });

  it('should reject non-integer days', () => {
    expect(() => RetentionPolicy.create(3.5)).toThrow();
  });

  describe('isExpired', () => {
    it('should return true when file date is older than retention period', () => {
      const policy = RetentionPolicy.create(7);
      const now = new Date('2026-03-14');
      const fileDate = new Date('2026-03-01');

      expect(policy.isExpired(fileDate, now)).toBe(true);
    });

    it('should return false when file date is within retention period', () => {
      const policy = RetentionPolicy.create(7);
      const now = new Date('2026-03-14');
      const fileDate = new Date('2026-03-10');

      expect(policy.isExpired(fileDate, now)).toBe(false);
    });

    it('should return false when file date is exactly at the retention boundary', () => {
      const policy = RetentionPolicy.create(7);
      const now = new Date('2026-03-14');
      const fileDate = new Date('2026-03-07');

      expect(policy.isExpired(fileDate, now)).toBe(false);
    });

    it('should use current date when now is not provided', () => {
      const policy = RetentionPolicy.create(1);
      const longAgo = new Date('2020-01-01');

      expect(policy.isExpired(longAgo)).toBe(true);
    });
  });
});
