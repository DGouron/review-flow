import { describe, expect, it } from 'vitest';
import { getQualityProgress, getQualityTrend } from '@/interface-adapters/views/dashboard/modules/quality.js';

describe('getQualityProgress', () => {
  it('should compute progress and target delta when score exists', () => {
    const result = getQualityProgress(6.5, 8);

    expect(result).toEqual({
      qualityScore: 6.5,
      qualityTarget: 8,
      progressPercent: 81.25,
      clampedProgressPercent: 81.25,
      targetDelta: -1.5,
      targetDeltaLabel: '-1.5',
    });
  });

  it('should clamp progress percent between 0 and 100', () => {
    const highResult = getQualityProgress(11, 8);
    const lowResult = getQualityProgress(-2, 8);

    expect(highResult.clampedProgressPercent).toBe(100);
    expect(lowResult.clampedProgressPercent).toBe(0);
  });

  it('should return empty values when score is not available', () => {
    const result = getQualityProgress(null, 8);

    expect(result).toEqual({
      qualityScore: null,
      qualityTarget: 8,
      progressPercent: null,
      clampedProgressPercent: 0,
      targetDelta: null,
      targetDeltaLabel: '',
    });
  });
});

describe('getQualityTrend', () => {
  it('should return upward trend when latest score improves', () => {
    const result = getQualityTrend({
      reviews: [
        { score: 6, timestamp: '2026-02-12T10:00:00.000Z' },
        { score: 7.5, timestamp: '2026-02-13T10:00:00.000Z' },
      ],
    });

    expect(result).toEqual({
      direction: 'up',
      delta: 1.5,
      label: '+1.5',
    });
  });

  it('should return downward trend when latest score drops', () => {
    const result = getQualityTrend({
      reviews: [
        { score: 9, timestamp: '2026-02-12T10:00:00.000Z' },
        { score: 7.2, timestamp: '2026-02-13T10:00:00.000Z' },
      ],
    });

    expect(result).toEqual({
      direction: 'down',
      delta: -1.8,
      label: '-1.8',
    });
  });

  it('should return flat trend when latest scores are equal', () => {
    const result = getQualityTrend({
      reviews: [
        { score: 8, timestamp: '2026-02-12T10:00:00.000Z' },
        { score: 8, timestamp: '2026-02-13T10:00:00.000Z' },
      ],
    });

    expect(result).toEqual({
      direction: 'flat',
      delta: 0,
      label: '0.0',
    });
  });

  it('should return unknown trend when there are less than two valid scores', () => {
    const result = getQualityTrend({
      reviews: [
        { score: null, timestamp: '2026-02-12T10:00:00.000Z' },
        { score: 8, timestamp: '2026-02-13T10:00:00.000Z' },
      ],
    });

    expect(result).toEqual({
      direction: 'unknown',
      delta: null,
      label: '',
    });
  });
});
