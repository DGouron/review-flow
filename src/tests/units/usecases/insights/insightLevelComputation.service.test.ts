import { describe, it, expect } from 'vitest';

import type {
  CategoryLevel,
  CategoryLevels,
} from '@/modules/statistics-insights/entities/insight/developerInsight.js';
import type { InsightTrend } from '@/modules/statistics-insights/entities/insight/insightTrend.js';
import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import {
  normalizeHigherIsBetter,
  normalizeLowerIsBetter,
  computeDeveloperMetrics,
  computeTeamMetrics,
  computeCategoryLevels,
  average,
  averageOfScores,
  averageCodeVolume,
  clampLevel,
  trendToScore,
  invertTrend,
  computeTrendForMetric,
  computeCodeVolumeTrend,
  identifyStrengths,
  identifyWeaknesses,
  identifyTopPriority,
  computeTitle,
  computeOverallLevel,
} from '@/modules/statistics-insights/usecases/insights/insightLevelComputation.service.js';
import { ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

function categoryLevel(level: number, trend: InsightTrend = 'stable'): CategoryLevel {
  return { level, trend };
}

function createCategoryLevels(overrides: Partial<CategoryLevels> = {}): CategoryLevels {
  return {
    quality: categoryLevel(5),
    responsiveness: categoryLevel(5),
    codeVolume: categoryLevel(5),
    iteration: categoryLevel(5),
    ...overrides,
  };
}

function createReviewsForDeveloper(
  developerName: string,
  count: number,
  overrides: Partial<ReviewStats> = {},
): ReviewStats[] {
  return Array.from({ length: count }, (_, index) =>
    ReviewStatsFactory.create({
      id: `${developerName}-${index}`,
      assignedBy: developerName,
      mrNumber: index + 1,
      ...overrides,
    }),
  );
}

describe('normalizeHigherIsBetter', () => {
  it('should return 0.5 when value equals team average', () => {
    const result = normalizeHigherIsBetter(7, 7, 10);

    expect(result).toBe(0.5);
  });

  it('should return above 0.5 when value is above team average', () => {
    const result = normalizeHigherIsBetter(8.3, 7.5, 10);

    expect(result).toBeGreaterThan(0.5);
  });

  it('should return below 0.5 when value is below team average', () => {
    const result = normalizeHigherIsBetter(6.4, 7.5, 10);

    expect(result).toBeLessThan(0.5);
  });

  it('should clamp to 1 for very high values', () => {
    const result = normalizeHigherIsBetter(15, 5, 10);

    expect(result).toBe(1);
  });

  it('should clamp to 0 for very low values', () => {
    const result = normalizeHigherIsBetter(1, 10, 10);

    expect(result).toBe(0);
  });

  it('should use maxValue when team average is 0', () => {
    const result = normalizeHigherIsBetter(5, 0, 10);

    expect(result).toBe(0.5);
  });
});

describe('normalizeLowerIsBetter', () => {
  it('should return 0.5 when value equals team average', () => {
    const result = normalizeLowerIsBetter(0.5, 0.5);

    expect(result).toBe(0.5);
  });

  it('should return above 0.5 when value is below team average (fewer issues is better)', () => {
    const result = normalizeLowerIsBetter(0.1, 0.5);

    expect(result).toBeGreaterThan(0.5);
  });

  it('should return below 0.5 when value is above team average (more issues is worse)', () => {
    const result = normalizeLowerIsBetter(1.1, 0.5);

    expect(result).toBeLessThan(0.5);
  });

  it('should return 1 when value is 0 and team average is 0', () => {
    const result = normalizeLowerIsBetter(0, 0);

    expect(result).toBe(1);
  });

  it('should return 0 when value is non-zero and team average is 0', () => {
    const result = normalizeLowerIsBetter(5, 0);

    expect(result).toBe(0);
  });
});

describe('level calibration with real-world data', () => {
  it('should produce quality level 8-9 for developer with score 8.3 and 0.1 blocking', () => {
    const damienReviews = createReviewsForDeveloper('damien', 35, {
      score: 8.3,
      blocking: 0,
      warnings: 1,
      duration: 60000,
    });
    const augReviews = createReviewsForDeveloper('aug', 44, {
      score: 7.4,
      blocking: 0,
      warnings: 2,
      duration: 60000,
    });
    const dariusReviews = createReviewsForDeveloper('darius', 14, {
      score: 6.4,
      blocking: 1,
      warnings: 2,
      duration: 60000,
    });
    const mathysReviews = createReviewsForDeveloper('mathys', 6, {
      score: 6.7,
      blocking: 1,
      warnings: 2,
      duration: 60000,
    });

    const reviewsByDeveloper = new Map<string, ReviewStats[]>();
    reviewsByDeveloper.set('damien', damienReviews);
    reviewsByDeveloper.set('aug', augReviews);
    reviewsByDeveloper.set('darius', dariusReviews);
    reviewsByDeveloper.set('mathys', mathysReviews);

    const teamMetrics = computeTeamMetrics(reviewsByDeveloper);
    const damienMetrics = computeDeveloperMetrics(damienReviews);
    const dariusMetrics = computeDeveloperMetrics(dariusReviews);

    const damienLevels = computeCategoryLevels(damienReviews, damienMetrics, teamMetrics);
    const dariusLevels = computeCategoryLevels(dariusReviews, dariusMetrics, teamMetrics);

    expect(damienLevels.quality.level).toBeGreaterThanOrEqual(7);
    expect(dariusLevels.quality.level).toBeLessThanOrEqual(5);
    expect(damienLevels.quality.level - dariusLevels.quality.level).toBeGreaterThanOrEqual(2);
  });

  it('should spread levels across 3-9 range instead of clustering at 5-6', () => {
    const highPerformer = createReviewsForDeveloper('high', 10, {
      score: 9,
      blocking: 0,
      warnings: 0,
      duration: 30000,
    });
    const lowPerformer = createReviewsForDeveloper('low', 10, {
      score: 4,
      blocking: 3,
      warnings: 5,
      duration: 300000,
    });

    const reviewsByDeveloper = new Map<string, ReviewStats[]>();
    reviewsByDeveloper.set('high', highPerformer);
    reviewsByDeveloper.set('low', lowPerformer);

    const teamMetrics = computeTeamMetrics(reviewsByDeveloper);
    const highMetrics = computeDeveloperMetrics(highPerformer);
    const lowMetrics = computeDeveloperMetrics(lowPerformer);

    const highLevels = computeCategoryLevels(highPerformer, highMetrics, teamMetrics);
    const lowLevels = computeCategoryLevels(lowPerformer, lowMetrics, teamMetrics);

    expect(highLevels.quality.level).toBeGreaterThanOrEqual(8);
    expect(lowLevels.quality.level).toBeLessThanOrEqual(3);
  });
});

describe('average', () => {
  it('should return 0 for an empty array', () => {
    expect(average([])).toBe(0);
  });

  it('should return the arithmetic mean for a non-empty array', () => {
    expect(average([2, 4, 6])).toBe(4);
  });
});

describe('averageOfScores', () => {
  it('should return the neutral fallback of 5 when no review has a score', () => {
    const reviews = [
      ReviewStatsFactory.create({ score: null }),
      ReviewStatsFactory.create({ score: null }),
    ];

    expect(averageOfScores(reviews)).toBe(5);
  });

  it('should average only the scored reviews', () => {
    const reviews = [
      ReviewStatsFactory.create({ score: 8 }),
      ReviewStatsFactory.create({ score: null }),
      ReviewStatsFactory.create({ score: 6 }),
    ];

    expect(averageOfScores(reviews)).toBe(7);
  });
});

describe('averageCodeVolume', () => {
  it('should return 0 when no review has diff stats', () => {
    const reviews = [
      ReviewStatsFactory.create({ diffStats: null }),
      ReviewStatsFactory.create({ diffStats: undefined }),
    ];

    expect(averageCodeVolume(reviews)).toBe(0);
  });

  it('should sum additions and deletions across reviews with diff stats', () => {
    const reviews = [
      ReviewStatsFactory.withDiffStats({ commitsCount: 1, additions: 100, deletions: 20 }),
      ReviewStatsFactory.create({ diffStats: null }),
      ReviewStatsFactory.withDiffStats({ commitsCount: 1, additions: 30, deletions: 10 }),
    ];

    expect(averageCodeVolume(reviews)).toBe(80);
  });
});

describe('clampLevel', () => {
  it('should clamp below the minimum to 1', () => {
    expect(clampLevel(-3)).toBe(1);
  });

  it('should clamp above the maximum to 10', () => {
    expect(clampLevel(42)).toBe(10);
  });

  it('should pass through values inside the range', () => {
    expect(clampLevel(6)).toBe(6);
  });
});

describe('trendToScore', () => {
  it('should map improving to 0.8', () => {
    expect(trendToScore('improving')).toBe(0.8);
  });

  it('should map stable to 0.5', () => {
    expect(trendToScore('stable')).toBe(0.5);
  });

  it('should map declining to 0.2', () => {
    expect(trendToScore('declining')).toBe(0.2);
  });
});

describe('invertTrend', () => {
  it('should invert improving to declining', () => {
    expect(invertTrend('improving')).toBe('declining');
  });

  it('should invert declining to improving', () => {
    expect(invertTrend('declining')).toBe('improving');
  });

  it('should keep stable unchanged', () => {
    expect(invertTrend('stable')).toBe('stable');
  });
});

describe('computeTrendForMetric', () => {
  const extractScore = (review: ReviewStats): number => review.score ?? 0;

  function reviewsWithScores(scores: number[]): ReviewStats[] {
    return scores.map((score, index) =>
      ReviewStatsFactory.create({
        id: `r-${index}`,
        score,
        timestamp: `2024-01-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
      }),
    );
  }

  it('should return stable when there are fewer reviews than the trend window', () => {
    const reviews = reviewsWithScores([5, 6, 7]);

    expect(computeTrendForMetric(reviews, extractScore)).toBe('stable');
  });

  it('should return stable when the previous window is empty', () => {
    const reviews = reviewsWithScores(Array.from({ length: 10 }, () => 5));

    expect(computeTrendForMetric(reviews, extractScore)).toBe('stable');
  });

  it('should return stable when both windows average exactly 0', () => {
    const reviews = reviewsWithScores(Array.from({ length: 15 }, () => 0));

    expect(computeTrendForMetric(reviews, extractScore)).toBe('stable');
  });

  it('should return improving when the recent window is clearly higher', () => {
    const reviews = reviewsWithScores([1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);

    expect(computeTrendForMetric(reviews, extractScore)).toBe('improving');
  });

  it('should return declining when the recent window is clearly lower', () => {
    const reviews = reviewsWithScores([9, 9, 9, 9, 9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);

    expect(computeTrendForMetric(reviews, extractScore)).toBe('declining');
  });

  it('should return stable when the change stays within the threshold', () => {
    const reviews = reviewsWithScores(Array.from({ length: 15 }, () => 5));

    expect(computeTrendForMetric(reviews, extractScore)).toBe('stable');
  });
});

describe('computeCodeVolumeTrend', () => {
  function volumeReviews(volumes: number[]): ReviewStats[] {
    return volumes.map((volume, index) =>
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: volume, deletions: 0 },
        { id: `v-${index}`, timestamp: `2024-01-${String(index + 1).padStart(2, '0')}T10:00:00Z` },
      ),
    );
  }

  it('should return stable when there are fewer reviews than the trend window', () => {
    expect(computeCodeVolumeTrend(volumeReviews([10, 20]))).toBe('stable');
  });

  it('should return stable when the previous window is empty', () => {
    expect(computeCodeVolumeTrend(volumeReviews(Array.from({ length: 10 }, () => 100)))).toBe(
      'stable',
    );
  });

  it('should return stable when the previous window volume is 0', () => {
    const reviews = [
      ...Array.from({ length: 5 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `z-${index}`,
          diffStats: null,
          timestamp: `2024-01-0${index + 1}T10:00:00Z`,
        }),
      ),
      ...volumeReviews(Array.from({ length: 10 }, () => 100)).map((review, index) => ({
        ...review,
        timestamp: `2024-01-${String(index + 6).padStart(2, '0')}T10:00:00Z`,
      })),
    ];

    expect(computeCodeVolumeTrend(reviews)).toBe('stable');
  });

  it('should return improving when recent volume grows beyond 15%', () => {
    const reviews = volumeReviews([
      100, 100, 100, 100, 100, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300,
    ]);

    expect(computeCodeVolumeTrend(reviews)).toBe('improving');
  });

  it('should return declining when recent volume drops beyond 15%', () => {
    const reviews = volumeReviews([
      300, 300, 300, 300, 300, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    ]);

    expect(computeCodeVolumeTrend(reviews)).toBe('declining');
  });

  it('should return stable when the volume change stays within 15%', () => {
    const reviews = volumeReviews(Array.from({ length: 15 }, () => 100));

    expect(computeCodeVolumeTrend(reviews)).toBe('stable');
  });
});

describe('identifyStrengths', () => {
  it('should include a category whose level meets the strength threshold', () => {
    const levels = createCategoryLevels({ quality: categoryLevel(8) });

    expect(identifyStrengths(levels)).toContain('quality');
  });

  it('should include a category improving above the trend threshold even below the level threshold', () => {
    const levels = createCategoryLevels({
      responsiveness: categoryLevel(5, 'improving'),
    });

    expect(identifyStrengths(levels)).toContain('responsiveness');
  });

  it('should return an empty array when no category qualifies', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(4, 'declining'),
      responsiveness: categoryLevel(4, 'declining'),
      codeVolume: categoryLevel(4, 'declining'),
      iteration: categoryLevel(4, 'declining'),
    });

    expect(identifyStrengths(levels)).toEqual([]);
  });
});

describe('identifyWeaknesses', () => {
  it('should include a category whose level is at or below the weakness threshold', () => {
    const levels = createCategoryLevels({ quality: categoryLevel(4) });

    expect(identifyWeaknesses(levels)).toContain('quality');
  });

  it('should include a declining category below the trend threshold even above the level threshold', () => {
    const levels = createCategoryLevels({
      responsiveness: categoryLevel(6, 'declining'),
    });

    expect(identifyWeaknesses(levels)).toContain('responsiveness');
  });

  it('should return an empty array when no category qualifies', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(8, 'improving'),
      responsiveness: categoryLevel(8, 'improving'),
      codeVolume: categoryLevel(8, 'improving'),
      iteration: categoryLevel(8, 'improving'),
    });

    expect(identifyWeaknesses(levels)).toEqual([]);
  });
});

describe('identifyTopPriority', () => {
  it('should return the lowest category when it is at or below 6', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(8),
      responsiveness: categoryLevel(3),
      codeVolume: categoryLevel(7),
      iteration: categoryLevel(9),
    });

    expect(identifyTopPriority(levels)).toBe('responsiveness');
  });

  it('should weight a declining category by lowering its priority score', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(5),
      responsiveness: categoryLevel(6, 'declining'),
      codeVolume: categoryLevel(7),
      iteration: categoryLevel(8),
    });

    expect(identifyTopPriority(levels)).toBe('responsiveness');
  });

  it('should return null when the lowest category is still above 6', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(7),
      responsiveness: categoryLevel(8),
      codeVolume: categoryLevel(9),
      iteration: categoryLevel(10),
    });

    expect(identifyTopPriority(levels)).toBeNull();
  });
});

describe('computeTitle', () => {
  it('should return polyvalent when the level spread is within the balanced threshold', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(6),
      responsiveness: categoryLevel(7),
      codeVolume: categoryLevel(8),
      iteration: categoryLevel(6),
    });

    expect(computeTitle(levels)).toBe('polyvalent');
  });

  it('should return risingStar when the lowest category is improving', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(9),
      responsiveness: categoryLevel(8),
      codeVolume: categoryLevel(2, 'improving'),
      iteration: categoryLevel(7),
    });

    expect(computeTitle(levels)).toBe('risingStar');
  });

  it('should map a dominant quality category to architect', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(10),
      responsiveness: categoryLevel(4),
      codeVolume: categoryLevel(3),
      iteration: categoryLevel(5),
    });

    expect(computeTitle(levels)).toBe('architect');
  });

  it('should map a dominant responsiveness category to firefighter', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(4),
      responsiveness: categoryLevel(10),
      codeVolume: categoryLevel(3),
      iteration: categoryLevel(5),
    });

    expect(computeTitle(levels)).toBe('firefighter');
  });

  it('should map a dominant codeVolume category to workhorse', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(4),
      responsiveness: categoryLevel(3),
      codeVolume: categoryLevel(10),
      iteration: categoryLevel(5),
    });

    expect(computeTitle(levels)).toBe('workhorse');
  });

  it('should map a dominant iteration category to sentinel', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(4),
      responsiveness: categoryLevel(3),
      codeVolume: categoryLevel(5),
      iteration: categoryLevel(10),
    });

    expect(computeTitle(levels)).toBe('sentinel');
  });
});

describe('computeOverallLevel', () => {
  it('should clamp the rounded average of all category levels', () => {
    const levels = createCategoryLevels({
      quality: categoryLevel(8),
      responsiveness: categoryLevel(7),
      codeVolume: categoryLevel(6),
      iteration: categoryLevel(7),
    });

    expect(computeOverallLevel(levels)).toBe(7);
  });
});

describe('computeDeveloperMetrics', () => {
  it('should report zero code volume and zero correlation when no diff stats exist', () => {
    const reviews = [
      ReviewStatsFactory.create({ diffStats: null }),
      ReviewStatsFactory.create({ diffStats: undefined }),
    ];

    const metrics = computeDeveloperMetrics(reviews);

    expect(metrics.averageCodeVolume).toBe(0);
    expect(metrics.codeVolumeScoreCorrelation).toBe(0);
  });

  it('should return zero correlation with fewer than three scored reviews carrying diff stats', () => {
    const reviews = [
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 50, deletions: 10 },
        { score: 8 },
      ),
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 30, deletions: 5 },
        { score: 6 },
      ),
    ];

    expect(computeDeveloperMetrics(reviews).codeVolumeScoreCorrelation).toBe(0);
  });

  it('should return zero correlation when volume has no variance', () => {
    const reviews = Array.from({ length: 4 }, (_, index) =>
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 100, deletions: 0 },
        { id: `c-${index}`, score: index + 1 },
      ),
    );

    expect(computeDeveloperMetrics(reviews).codeVolumeScoreCorrelation).toBe(0);
  });

  it('should compute a positive correlation when score grows with volume', () => {
    const reviews = [
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 10, deletions: 0 },
        { id: 'p-1', score: 2 },
      ),
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 50, deletions: 0 },
        { id: 'p-2', score: 5 },
      ),
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 100, deletions: 0 },
        { id: 'p-3', score: 9 },
      ),
    ];

    expect(computeDeveloperMetrics(reviews).codeVolumeScoreCorrelation).toBeGreaterThan(0);
  });
});

describe('computeTeamMetrics', () => {
  it('should aggregate reviews across all developers', () => {
    const reviewsByDeveloper = new Map<string, ReviewStats[]>();
    reviewsByDeveloper.set('alice', [
      ReviewStatsFactory.create({ id: 'a-1', score: 8, blocking: 0, warnings: 1 }),
    ]);
    reviewsByDeveloper.set('bob', [
      ReviewStatsFactory.create({ id: 'b-1', score: 6, blocking: 2, warnings: 3 }),
    ]);

    const metrics = computeTeamMetrics(reviewsByDeveloper);

    expect(metrics.averageScore).toBe(7);
    expect(metrics.averageBlocking).toBe(1);
    expect(metrics.averageWarnings).toBe(2);
  });

  it('should fall back to neutral score and zero volume for an empty team', () => {
    const metrics = computeTeamMetrics(new Map<string, ReviewStats[]>());

    expect(metrics.averageScore).toBe(5);
    expect(metrics.averageCodeVolume).toBe(0);
  });
});

describe('computeCategoryLevels code volume and iteration branches', () => {
  it('should use the neutral volume score when the team code volume is 0', () => {
    const reviews = [ReviewStatsFactory.create({ diffStats: null })];
    const metrics = computeDeveloperMetrics(reviews);
    const teamMetrics = computeTeamMetrics(new Map([['solo', reviews]]));

    const levels = computeCategoryLevels(reviews, metrics, teamMetrics);

    expect(levels.codeVolume.level).toBeGreaterThanOrEqual(1);
    expect(levels.codeVolume.level).toBeLessThanOrEqual(10);
  });

  it('should use the neutral suggestion fallback when reviews carry no suggestions', () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'it-1', suggestions: undefined, blocking: 0, warnings: 0 }),
      ReviewStatsFactory.create({ id: 'it-2', suggestions: undefined, blocking: 0, warnings: 0 }),
    ];
    const metrics = computeDeveloperMetrics(reviews);
    const teamMetrics = computeTeamMetrics(new Map([['solo', reviews]]));

    const levels = computeCategoryLevels(reviews, metrics, teamMetrics);

    expect(levels.iteration.level).toBeGreaterThanOrEqual(1);
    expect(levels.iteration.level).toBeLessThanOrEqual(10);
  });

  it('should fall back to neutral iteration scores for an empty review set', () => {
    const metrics = computeDeveloperMetrics([]);
    const teamMetrics = computeTeamMetrics(new Map<string, ReviewStats[]>());

    const levels = computeCategoryLevels([], metrics, teamMetrics);

    expect(levels.iteration.level).toBeGreaterThanOrEqual(1);
    expect(levels.iteration.level).toBeLessThanOrEqual(10);
  });

  it('should reward a positive code volume correlation', () => {
    const reviews = [
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 10, deletions: 0 },
        { id: 'cv-1', score: 2 },
      ),
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 50, deletions: 0 },
        { id: 'cv-2', score: 5 },
      ),
      ReviewStatsFactory.withDiffStats(
        { commitsCount: 1, additions: 100, deletions: 0 },
        { id: 'cv-3', score: 9 },
      ),
    ];
    const metrics = computeDeveloperMetrics(reviews);
    const teamMetrics = computeTeamMetrics(new Map([['solo', reviews]]));

    const levels = computeCategoryLevels(reviews, metrics, teamMetrics);

    expect(levels.codeVolume.level).toBeGreaterThanOrEqual(1);
    expect(metrics.codeVolumeScoreCorrelation).toBeGreaterThan(0);
  });
});
