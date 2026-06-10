import { describe, it, expect } from 'vitest';

import {
  getStatBarColorClass,
  getAvatarBorderClass,
  getTierClass,
  getTrendClass,
} from '@/dashboard/modules/sharedViewHelpers.js';

describe('sharedViewHelpers', () => {
  describe('getStatBarColorClass', () => {
    it('returns danger for low levels', () => {
      expect(getStatBarColorClass(1)).toBe('stat-bar-danger');
      expect(getStatBarColorClass(3)).toBe('stat-bar-danger');
    });
    it('returns warning for mid-low levels', () => {
      expect(getStatBarColorClass(4)).toBe('stat-bar-warning');
      expect(getStatBarColorClass(6)).toBe('stat-bar-warning');
    });
    it('returns focus for mid-high levels', () => {
      expect(getStatBarColorClass(7)).toBe('stat-bar-focus');
      expect(getStatBarColorClass(8)).toBe('stat-bar-focus');
    });
    it('returns success for high levels', () => {
      expect(getStatBarColorClass(9)).toBe('stat-bar-success');
      expect(getStatBarColorClass(10)).toBe('stat-bar-success');
    });
  });

  describe('getAvatarBorderClass', () => {
    it('mirrors the stat-bar tiering on the avatar border', () => {
      expect(getAvatarBorderClass(2)).toBe('dev-avatar-danger');
      expect(getAvatarBorderClass(5)).toBe('dev-avatar-warning');
      expect(getAvatarBorderClass(7)).toBe('dev-avatar-focus');
      expect(getAvatarBorderClass(10)).toBe('dev-avatar-success');
    });
  });

  describe('getTierClass', () => {
    it('produces tier classes consistent with level thresholds', () => {
      expect(getTierClass(3)).toBe('tier-danger');
      expect(getTierClass(10)).toMatch(/^tier-/);
    });
  });

  describe('getTrendClass', () => {
    it('maps trend strings to a trend CSS class', () => {
      expect(typeof getTrendClass('up')).toBe('string');
      expect(typeof getTrendClass('down')).toBe('string');
      expect(typeof getTrendClass('stable')).toBe('string');
    });
  });
});
