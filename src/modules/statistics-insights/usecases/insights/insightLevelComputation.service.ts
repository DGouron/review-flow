import type {
  CategoryLevel,
  CategoryLevels,
} from '@/modules/statistics-insights/entities/insight/developerInsight.js';
import type { DeveloperTitle } from '@/modules/statistics-insights/entities/insight/developerTitle.js';
import type { InsightCategory } from '@/modules/statistics-insights/entities/insight/insightCategory.js';
import { INSIGHT_CATEGORIES } from '@/modules/statistics-insights/entities/insight/insightCategory.js';
import type { InsightTrend } from '@/modules/statistics-insights/entities/insight/insightTrend.js';
import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';

export const MINIMUM_REVIEWS_THRESHOLD = 5;
const RELATIVE_WEIGHT = 0.8;
const TREND_WEIGHT = 0.2;
const TREND_WINDOW_SIZE = 10;
const STRENGTH_THRESHOLD = 7;
const WEAKNESS_THRESHOLD = 4;
const STRENGTH_TREND_THRESHOLD = 5;
const WEAKNESS_TREND_THRESHOLD = 6;
const BALANCED_SPREAD_THRESHOLD = 2;

export interface DeveloperMetrics {
  averageScore: number;
  averageBlocking: number;
  averageWarnings: number;
  averageDuration: number;
  averageCodeVolume: number;
  codeVolumeScoreCorrelation: number;
}

export interface TeamMetrics {
  averageScore: number;
  averageBlocking: number;
  averageWarnings: number;
  averageDuration: number;
  averageCodeVolume: number;
}

export const ABSOLUTE_BENCHMARKS: TeamMetrics = {
  averageScore: 7,
  averageBlocking: 1,
  averageWarnings: 2,
  averageDuration: 120000,
  averageCodeVolume: 150,
};

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function averageOfScores(reviews: ReviewStats[]): number {
  const withScore = reviews.filter((review) => review.score !== null);
  if (withScore.length === 0) return 5;
  return average(withScore.map((review) => review.score ?? 0));
}

export function averageCodeVolume(reviews: ReviewStats[]): number {
  const withDiffStats = reviews.filter(
    (review) => review.diffStats !== null && review.diffStats !== undefined,
  );
  if (withDiffStats.length === 0) return 0;
  return average(
    withDiffStats.map(
      (review) => (review.diffStats?.additions ?? 0) + (review.diffStats?.deletions ?? 0),
    ),
  );
}

export function clampLevel(level: number): number {
  return Math.min(10, Math.max(1, level));
}

export function normalizeHigherIsBetter(
  value: number,
  teamAverage: number,
  maxValue: number,
): number {
  if (teamAverage === 0) return Math.min(1, value / maxValue);
  // Amplified deviation: 2x multiplier spreads values across 0-1 range
  // At team avg → 0.5, +25% above → 1.0, -25% below → 0.0
  const deviation = (value - teamAverage) / teamAverage;
  return Math.min(1, Math.max(0, 0.5 + deviation * 2));
}

export function normalizeLowerIsBetter(value: number, teamAverage: number): number {
  if (teamAverage === 0) return value === 0 ? 1 : 0;
  // Amplified deviation: mirrors normalizeHigherIsBetter
  const deviation = (teamAverage - value) / teamAverage;
  return Math.min(1, Math.max(0, 0.5 + deviation * 2));
}

export function trendToScore(trend: InsightTrend): number {
  switch (trend) {
    case 'improving':
      return 0.8;
    case 'stable':
      return 0.5;
    case 'declining':
      return 0.2;
  }
}

export function invertTrend(trend: InsightTrend): InsightTrend {
  switch (trend) {
    case 'improving':
      return 'declining';
    case 'declining':
      return 'improving';
    case 'stable':
      return 'stable';
  }
}

function averageCodeVolumeFromReviews(reviews: ReviewStats[]): number {
  const withDiffStats = reviews.filter(
    (review) => review.diffStats !== null && review.diffStats !== undefined,
  );
  if (withDiffStats.length === 0) return 0;
  return average(
    withDiffStats.map(
      (review) => (review.diffStats?.additions ?? 0) + (review.diffStats?.deletions ?? 0),
    ),
  );
}

export function computeTrendForMetric(
  reviews: ReviewStats[],
  extractor: (review: ReviewStats) => number,
): InsightTrend {
  if (reviews.length < TREND_WINDOW_SIZE) return 'stable';

  const sorted = [...reviews].toSorted(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const recentStart = Math.max(0, sorted.length - TREND_WINDOW_SIZE);
  const previousStart = Math.max(0, recentStart - TREND_WINDOW_SIZE);

  const recent = sorted.slice(recentStart);
  const previous = sorted.slice(previousStart, recentStart);

  if (previous.length === 0) return 'stable';

  const recentAverage = average(recent.map(extractor));
  const previousAverage = average(previous.map(extractor));

  if (previousAverage === 0 && recentAverage === 0) return 'stable';

  const threshold = Math.max(Math.abs(previousAverage) * 0.1, 0.5);

  if (recentAverage > previousAverage + threshold) return 'improving';
  if (recentAverage < previousAverage - threshold) return 'declining';
  return 'stable';
}

export function computeCodeVolumeTrend(reviews: ReviewStats[]): InsightTrend {
  if (reviews.length < TREND_WINDOW_SIZE) return 'stable';

  const sorted = [...reviews].toSorted(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const recentStart = Math.max(0, sorted.length - TREND_WINDOW_SIZE);
  const previousStart = Math.max(0, recentStart - TREND_WINDOW_SIZE);

  const recent = sorted.slice(recentStart);
  const previous = sorted.slice(previousStart, recentStart);

  if (previous.length === 0) return 'stable';

  const recentVolume = averageCodeVolumeFromReviews(recent);
  const previousVolume = averageCodeVolumeFromReviews(previous);

  if (previousVolume === 0) return 'stable';

  const changeRatio = (recentVolume - previousVolume) / previousVolume;

  if (changeRatio > 0.15) return 'improving';
  if (changeRatio < -0.15) return 'declining';
  return 'stable';
}

export function identifyStrengths(categoryLevels: CategoryLevels): InsightCategory[] {
  const strengths: InsightCategory[] = [];

  for (const category of INSIGHT_CATEGORIES) {
    const { level, trend } = categoryLevels[category];
    if (
      level >= STRENGTH_THRESHOLD ||
      (trend === 'improving' && level >= STRENGTH_TREND_THRESHOLD)
    ) {
      strengths.push(category);
    }
  }

  return strengths;
}

export function identifyWeaknesses(categoryLevels: CategoryLevels): InsightCategory[] {
  const weaknesses: InsightCategory[] = [];

  for (const category of INSIGHT_CATEGORIES) {
    const { level, trend } = categoryLevels[category];
    if (
      level <= WEAKNESS_THRESHOLD ||
      (trend === 'declining' && level <= WEAKNESS_TREND_THRESHOLD)
    ) {
      weaknesses.push(category);
    }
  }

  return weaknesses;
}

export function identifyTopPriority(categoryLevels: CategoryLevels): InsightCategory | null {
  let lowestCategory: InsightCategory | null = null;
  let lowestScore = Number.POSITIVE_INFINITY;

  for (const category of INSIGHT_CATEGORIES) {
    const { level, trend } = categoryLevels[category];
    const priorityScore = trend === 'declining' ? level - 2 : level;

    if (priorityScore < lowestScore) {
      lowestScore = priorityScore;
      lowestCategory = category;
    }
  }

  if (lowestCategory !== null && categoryLevels[lowestCategory].level > 6) {
    return null;
  }

  return lowestCategory;
}

export function computeTitle(categoryLevels: CategoryLevels): DeveloperTitle {
  const levels = INSIGHT_CATEGORIES.map((category) => ({
    category,
    level: categoryLevels[category].level,
    trend: categoryLevels[category].trend,
  }));

  const maxLevel = Math.max(...levels.map((level) => level.level));
  const minLevel = Math.min(...levels.map((level) => level.level));

  if (maxLevel - minLevel <= BALANCED_SPREAD_THRESHOLD) {
    return 'polyvalent';
  }

  const lowestCategory = levels.reduce((lowest, current) =>
    current.level < lowest.level ? current : lowest,
  );
  if (lowestCategory.trend === 'improving') {
    return 'risingStar';
  }

  const dominantCategory = levels.reduce((highest, current) =>
    current.level > highest.level ? current : highest,
  );

  const categoryTitleMap: Record<InsightCategory, DeveloperTitle> = {
    quality: 'architect',
    responsiveness: 'firefighter',
    codeVolume: 'workhorse',
    iteration: 'sentinel',
  };

  return categoryTitleMap[dominantCategory.category];
}

export function computeOverallLevel(categoryLevels: CategoryLevels): number {
  const levels = INSIGHT_CATEGORIES.map((category) => categoryLevels[category].level);
  const rawAverage = average(levels);
  return clampLevel(Math.round(rawAverage));
}

function extractQualityMetric(review: ReviewStats): number {
  const score = review.score ?? 5;
  const blockingPenalty = review.blocking * 0.5;
  const warningsPenalty = review.warnings * 0.2;
  return score - blockingPenalty - warningsPenalty;
}

function extractDurationMetric(review: ReviewStats): number {
  return review.duration;
}

function extractIterationMetric(review: ReviewStats): number {
  return review.blocking + review.warnings * 0.5;
}

export function computeDeveloperMetrics(reviews: ReviewStats[]): DeveloperMetrics {
  const reviewsWithDiffStats = reviews.filter(
    (review) => review.diffStats !== null && review.diffStats !== undefined,
  );
  const averageVolume =
    reviewsWithDiffStats.length > 0
      ? average(
          reviewsWithDiffStats.map(
            (review) => (review.diffStats?.additions ?? 0) + (review.diffStats?.deletions ?? 0),
          ),
        )
      : 0;

  const correlation = computeVolumeScoreCorrelation(reviews);

  return {
    averageScore: averageOfScores(reviews),
    averageBlocking: average(reviews.map((review) => review.blocking)),
    averageWarnings: average(reviews.map((review) => review.warnings)),
    averageDuration: average(reviews.map((review) => review.duration)),
    averageCodeVolume: averageVolume,
    codeVolumeScoreCorrelation: correlation,
  };
}

function computeVolumeScoreCorrelation(reviews: ReviewStats[]): number {
  const reviewsWithBoth = reviews.filter(
    (review) =>
      review.score !== null && review.diffStats !== null && review.diffStats !== undefined,
  );

  if (reviewsWithBoth.length < 3) return 0;

  const scores = reviewsWithBoth.map((review) => review.score ?? 0);
  const volumes = reviewsWithBoth.map(
    (review) => (review.diffStats?.additions ?? 0) + (review.diffStats?.deletions ?? 0),
  );

  const avgScore = average(scores);
  const avgVolume = average(volumes);

  let numerator = 0;
  let denominatorScore = 0;
  let denominatorVolume = 0;

  for (let index = 0; index < reviewsWithBoth.length; index++) {
    const scoreDiff = scores[index] - avgScore;
    const volumeDiff = volumes[index] - avgVolume;
    numerator += scoreDiff * volumeDiff;
    denominatorScore += scoreDiff * scoreDiff;
    denominatorVolume += volumeDiff * volumeDiff;
  }

  const denominator = Math.sqrt(denominatorScore * denominatorVolume);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

export function computeTeamMetrics(reviewsByDeveloper: Map<string, ReviewStats[]>): TeamMetrics {
  const allReviews: ReviewStats[] = [];
  for (const reviews of reviewsByDeveloper.values()) {
    allReviews.push(...reviews);
  }

  return {
    averageScore: averageOfScores(allReviews),
    averageBlocking: average(allReviews.map((review) => review.blocking)),
    averageWarnings: average(allReviews.map((review) => review.warnings)),
    averageDuration: average(allReviews.map((review) => review.duration)),
    averageCodeVolume: averageCodeVolume(allReviews),
  };
}

export function computeCategoryLevels(
  reviews: ReviewStats[],
  metrics: DeveloperMetrics,
  teamMetrics: TeamMetrics,
): CategoryLevels {
  return {
    quality: computeQualityLevel(reviews, metrics, teamMetrics),
    responsiveness: computeResponsivenessLevel(reviews, metrics, teamMetrics),
    codeVolume: computeCodeVolumeLevel(reviews, metrics, teamMetrics),
    iteration: computeIterationLevel(reviews, metrics, teamMetrics),
  };
}

function computeQualityLevel(
  reviews: ReviewStats[],
  metrics: DeveloperMetrics,
  teamMetrics: TeamMetrics,
): CategoryLevel {
  // Absolute score component: score is already 0-10, map directly to 0-1
  const absoluteScoreComponent = metrics.averageScore / 10;

  // Relative components: how dev compares to team
  const relativeScoreComponent = normalizeHigherIsBetter(
    metrics.averageScore,
    teamMetrics.averageScore,
    10,
  );
  const blockingComponent = normalizeLowerIsBetter(
    metrics.averageBlocking,
    teamMetrics.averageBlocking,
  );
  const warningsComponent = normalizeLowerIsBetter(
    metrics.averageWarnings,
    teamMetrics.averageWarnings,
  );

  // Blend absolute (40%) and relative (60%) for score
  const scoreComponent = absoluteScoreComponent * 0.4 + relativeScoreComponent * 0.6;
  const relativeScore = scoreComponent * 0.5 + blockingComponent * 0.3 + warningsComponent * 0.2;

  const trend = computeTrendForMetric(reviews, extractQualityMetric);
  const trendScore = trendToScore(trend);

  const rawLevel = relativeScore * RELATIVE_WEIGHT + trendScore * TREND_WEIGHT;
  const level = clampLevel(Math.round(rawLevel * 9 + 1));

  return { level, trend };
}

function computeResponsivenessLevel(
  reviews: ReviewStats[],
  metrics: DeveloperMetrics,
  teamMetrics: TeamMetrics,
): CategoryLevel {
  const relativeScore = normalizeLowerIsBetter(
    metrics.averageDuration,
    teamMetrics.averageDuration,
  );

  const trend = computeTrendForMetric(reviews, extractDurationMetric);
  const trendScore = trendToScore(trend);

  const rawLevel = relativeScore * RELATIVE_WEIGHT + trendScore * TREND_WEIGHT;
  const level = clampLevel(Math.round(rawLevel * 9 + 1));

  return { level, trend: invertTrend(trend) };
}

function computeCodeVolumeLevel(
  reviews: ReviewStats[],
  metrics: DeveloperMetrics,
  teamMetrics: TeamMetrics,
): CategoryLevel {
  const volumeScore =
    teamMetrics.averageCodeVolume > 0
      ? normalizeHigherIsBetter(
          metrics.averageCodeVolume,
          teamMetrics.averageCodeVolume,
          teamMetrics.averageCodeVolume * 5,
        )
      : 0.5;

  const correlationBonus =
    metrics.codeVolumeScoreCorrelation > 0 ? metrics.codeVolumeScoreCorrelation * 0.2 : 0;

  const relativeScore = Math.min(1, volumeScore + correlationBonus);

  const trend = computeCodeVolumeTrend(reviews);
  const trendScore = trendToScore(trend);

  const rawLevel = relativeScore * RELATIVE_WEIGHT + trendScore * TREND_WEIGHT;
  const level = clampLevel(Math.round(rawLevel * 9 + 1));

  return { level, trend };
}

function computeIterationLevel(
  reviews: ReviewStats[],
  _metrics: DeveloperMetrics,
  _teamMetrics: TeamMetrics,
): CategoryLevel {
  const reviewsWithWarnings = reviews.filter(
    (review) => review.warnings > 0 || review.blocking > 0,
  );
  const resolutionRatio =
    reviews.length > 0 ? 1 - reviewsWithWarnings.length / reviews.length : 0.5;

  const averageSuggestions = average(reviews.map((review) => review.suggestions ?? 0));
  const suggestionScore =
    averageSuggestions > 0 ? Math.min(1, 1 / (1 + averageSuggestions * 0.1)) : 0.7;

  const relativeScore = resolutionRatio * 0.6 + suggestionScore * 0.4;

  const trend = computeTrendForMetric(reviews, extractIterationMetric);
  const trendScore = trendToScore(trend);

  const rawLevel = relativeScore * RELATIVE_WEIGHT + trendScore * TREND_WEIGHT;
  const level = clampLevel(Math.round(rawLevel * 9 + 1));

  return { level, trend: invertTrend(trend) };
}
