import { describe, it, expect, beforeEach } from 'vitest';
import { formatTime, formatDuration, formatPhase, formatLogTime } from '@/interface-adapters/views/dashboard/modules/formatting.js';
import { setLanguage } from '@/interface-adapters/views/dashboard/modules/i18n.js';

describe('formatTime', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('should return "-" for null or undefined input', () => {
    expect(formatTime(null)).toBe('-');
    expect(formatTime(undefined)).toBe('-');
  });

  it('should return "Just now" for a date less than 60 seconds ago', () => {
    const result = formatTime(new Date().toISOString());
    expect(result).toBe('Just now');
  });

  it('should return minutes ago for a date less than 1 hour ago', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
    const result = formatTime(fiveMinutesAgo);
    expect(result).toBe('5 min ago');
  });

  it('should return hours ago for a date less than 1 day ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    const result = formatTime(threeHoursAgo);
    expect(result).toBe('3h ago');
  });

  it('should return localized date for a date more than 1 day ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    const result = formatTime(twoDaysAgo);
    expect(result).toMatch(/\d/);
  });

  it('should return French translations when language is fr', () => {
    setLanguage('fr');
    const now = new Date().toISOString();
    expect(formatTime(now)).toBe("À l'instant");

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatTime(fiveMinutesAgo)).toBe('Il y a 5 min');

    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(formatTime(threeHoursAgo)).toBe('Il y a 3h');
  });
});

describe('formatDuration', () => {
  it('should return empty string when no arguments provided', () => {
    expect(formatDuration(null, null, undefined)).toBe('');
  });

  it('should format seconds from totalMs', () => {
    expect(formatDuration(null, null, 45000)).toBe('45s');
  });

  it('should format minutes and seconds from totalMs', () => {
    expect(formatDuration(null, null, 125000)).toBe('2m 5s');
  });

  it('should format hours and minutes from totalMs', () => {
    expect(formatDuration(null, null, 7380000)).toBe('2h 3m');
  });

  it('should compute duration from start and end dates', () => {
    const start = new Date('2026-01-01T10:00:00Z').toISOString();
    const end = new Date('2026-01-01T10:05:30Z').toISOString();
    expect(formatDuration(start, end, undefined)).toBe('5m 30s');
  });

  it('should compute duration from start to now when no end date', () => {
    const fewSecondsAgo = new Date(Date.now() - 10000).toISOString();
    const result = formatDuration(fewSecondsAgo, null, undefined);
    expect(result).toMatch(/^\d+s$/);
  });
});

describe('formatPhase', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('should return translated phase labels in English', () => {
    expect(formatPhase('initializing')).toBe('Initializing');
    expect(formatPhase('agents-running')).toBe('Agents running');
    expect(formatPhase('synthesizing')).toBe('Synthesizing');
    expect(formatPhase('publishing')).toBe('Publishing');
    expect(formatPhase('completed')).toBe('Completed');
  });

  it('should return translated phase labels in French', () => {
    setLanguage('fr');
    expect(formatPhase('initializing')).toBe('Initialisation');
    expect(formatPhase('agents-running')).toBe('Agents en cours');
    expect(formatPhase('synthesizing')).toBe('Synthèse');
    expect(formatPhase('publishing')).toBe('Publication');
    expect(formatPhase('completed')).toBe('Terminé');
  });

  it('should return the i18n key for unknown phases', () => {
    expect(formatPhase('unknown-phase')).toBe('phase.unknown-phase');
  });
});

describe('formatLogTime', () => {
  it('should return a time string from a timestamp', () => {
    const timestamp = new Date('2026-01-15T14:30:45Z').getTime();
    const result = formatLogTime(timestamp);
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});
