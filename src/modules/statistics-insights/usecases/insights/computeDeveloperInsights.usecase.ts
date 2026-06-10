import type {
  DeveloperInsight,
  CategoryLevels,
  InsightDescription,
} from '@/modules/statistics-insights/entities/insight/developerInsight.js';
import type { InsightCategory } from '@/modules/statistics-insights/entities/insight/insightCategory.js';
import type { InsightTrend } from '@/modules/statistics-insights/entities/insight/insightTrend.js';
import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import {
  MINIMUM_REVIEWS_THRESHOLD,
  ABSOLUTE_BENCHMARKS,
  computeTeamMetrics,
  computeDeveloperMetrics,
  computeCategoryLevels,
  identifyStrengths,
  identifyWeaknesses,
  identifyTopPriority,
  computeTitle,
  computeOverallLevel,
  average,
} from '@/modules/statistics-insights/usecases/insights/insightLevelComputation.service.js';
import type {
  DeveloperMetrics as ServiceDeveloperMetrics,
  TeamMetrics,
} from '@/modules/statistics-insights/usecases/insights/insightLevelComputation.service.js';

const QUALITY_SCORE_THRESHOLD = 7;

export function computeDeveloperInsights(reviews: ReviewStats[]): DeveloperInsight[] {
  const reviewsByDeveloper = groupReviewsByDeveloper(reviews);
  const eligibleDevelopers = filterEligibleDevelopers(reviewsByDeveloper);

  if (eligibleDevelopers.size === 0) {
    return [];
  }

  const isSingleDeveloper = eligibleDevelopers.size === 1;
  const teamMetrics = isSingleDeveloper
    ? ABSOLUTE_BENCHMARKS
    : computeTeamMetrics(eligibleDevelopers);

  const insights: DeveloperInsight[] = [];

  for (const [developerName, developerReviews] of eligibleDevelopers) {
    const insight = computeInsightForDeveloper(developerName, developerReviews, teamMetrics);
    insights.push(insight);
  }

  return insights;
}

function groupReviewsByDeveloper(reviews: ReviewStats[]): Map<string, ReviewStats[]> {
  const grouped = new Map<string, ReviewStats[]>();

  for (const review of reviews) {
    if (!review.assignedBy) continue;

    const existing = grouped.get(review.assignedBy);
    if (existing) {
      existing.push(review);
    } else {
      grouped.set(review.assignedBy, [review]);
    }
  }

  return grouped;
}

function filterEligibleDevelopers(
  reviewsByDeveloper: Map<string, ReviewStats[]>,
): Map<string, ReviewStats[]> {
  const eligible = new Map<string, ReviewStats[]>();

  for (const [name, reviews] of reviewsByDeveloper) {
    if (reviews.length >= MINIMUM_REVIEWS_THRESHOLD) {
      eligible.set(name, reviews);
    }
  }

  return eligible;
}

function computeFirstReviewQualityRate(reviews: ReviewStats[]): number {
  const reviewsWithScore = reviews.filter((review) => review.score !== null);
  if (reviewsWithScore.length === 0) return 0;
  const qualityReviews = reviewsWithScore.filter(
    (review) => (review.score ?? 0) >= QUALITY_SCORE_THRESHOLD && review.blocking === 0,
  );
  return qualityReviews.length / reviewsWithScore.length;
}

function computeAverageAdditions(reviews: ReviewStats[]): number {
  const withDiffStats = reviews.filter(
    (review) => review.diffStats !== null && review.diffStats !== undefined,
  );
  if (withDiffStats.length === 0) return 0;
  return average(withDiffStats.map((review) => review.diffStats?.additions ?? 0));
}

function computeAverageDeletions(reviews: ReviewStats[]): number {
  const withDiffStats = reviews.filter(
    (review) => review.diffStats !== null && review.diffStats !== undefined,
  );
  if (withDiffStats.length === 0) return 0;
  return average(withDiffStats.map((review) => review.diffStats?.deletions ?? 0));
}

function computePercentDifference(value: number, teamAverage: number): number {
  if (teamAverage === 0) return 0;
  return Math.round(((value - teamAverage) / teamAverage) * 100);
}

function generateInsightDescriptions(
  serviceMetrics: ServiceDeveloperMetrics,
  teamMetrics: TeamMetrics,
  strengths: InsightCategory[],
  weaknesses: InsightCategory[],
  reviews: ReviewStats[],
  categoryLevels: CategoryLevels,
): InsightDescription[] {
  const descriptions: InsightDescription[] = [];

  for (const category of strengths) {
    const isTrendBased =
      categoryLevels[category].level < 7 && categoryLevels[category].trend === 'improving';
    const description = isTrendBased
      ? generateTrendStrengthDescription(category, categoryLevels[category].trend)
      : generateStrengthDescription(category, serviceMetrics, teamMetrics, reviews);
    if (description !== null) {
      descriptions.push(description);
    }
  }

  for (const category of weaknesses) {
    const description = generateWeaknessDescription(category, serviceMetrics, teamMetrics, reviews);
    if (description !== null) {
      descriptions.push(description);
    }
  }

  return descriptions;
}

function generateTrendStrengthDescription(
  category: InsightCategory,
  _trend: InsightTrend,
): InsightDescription {
  return {
    category,
    type: 'strength',
    descriptionKey: `insight.${category}.improving`,
    params: {},
  };
}

function generateStrengthDescription(
  category: InsightCategory,
  metrics: ServiceDeveloperMetrics,
  teamMetrics: TeamMetrics,
  reviews: ReviewStats[],
): InsightDescription | null {
  switch (category) {
    case 'quality': {
      const percent = computePercentDifference(metrics.averageScore, teamMetrics.averageScore);
      return {
        category: 'quality',
        type: 'strength',
        descriptionKey: 'insight.quality.highScore',
        params: {
          score: Math.round(metrics.averageScore * 10) / 10,
          teamAverage: Math.round(teamMetrics.averageScore * 10) / 10,
          percent: Math.abs(percent),
        },
      };
    }
    case 'responsiveness': {
      const percent = computePercentDifference(
        teamMetrics.averageDuration,
        metrics.averageDuration,
      );
      return {
        category: 'responsiveness',
        type: 'strength',
        descriptionKey: 'insight.responsiveness.fast',
        params: {
          duration: formatDuration(metrics.averageDuration),
          teamAverage: formatDuration(teamMetrics.averageDuration),
          percent: Math.abs(percent),
        },
      };
    }
    case 'codeVolume':
      return {
        category: 'codeVolume',
        type: 'strength',
        descriptionKey: 'insight.codeVolume.high',
        params: { lines: Math.round(metrics.averageCodeVolume) },
      };
    case 'iteration': {
      const qualityRate = computeFirstReviewQualityRate(reviews);
      return {
        category: 'iteration',
        type: 'strength',
        descriptionKey: 'insight.iteration.good',
        params: { rate: Math.round(qualityRate * 100) },
      };
    }
  }
}

function generateWeaknessDescription(
  category: InsightCategory,
  metrics: ServiceDeveloperMetrics,
  teamMetrics: TeamMetrics,
  reviews: ReviewStats[],
): InsightDescription | null {
  switch (category) {
    case 'quality': {
      const percent = computePercentDifference(
        metrics.averageBlocking,
        teamMetrics.averageBlocking,
      );
      return {
        category: 'quality',
        type: 'weakness',
        descriptionKey: 'insight.quality.highBlocking',
        params: {
          blocking: Math.round(metrics.averageBlocking * 10) / 10,
          teamAverage: Math.round(teamMetrics.averageBlocking * 10) / 10,
          percent: Math.abs(percent),
        },
      };
    }
    case 'responsiveness': {
      const percent = computePercentDifference(
        metrics.averageDuration,
        teamMetrics.averageDuration,
      );
      return {
        category: 'responsiveness',
        type: 'weakness',
        descriptionKey: 'insight.responsiveness.slow',
        params: {
          duration: formatDuration(metrics.averageDuration),
          teamAverage: formatDuration(teamMetrics.averageDuration),
          percent: Math.abs(percent),
        },
      };
    }
    case 'codeVolume':
      return {
        category: 'codeVolume',
        type: 'weakness',
        descriptionKey: 'insight.codeVolume.low',
        params: { lines: Math.round(metrics.averageCodeVolume) },
      };
    case 'iteration': {
      const qualityRate = computeFirstReviewQualityRate(reviews);
      return {
        category: 'iteration',
        type: 'weakness',
        descriptionKey: 'insight.iteration.poor',
        params: { rate: Math.round((1 - qualityRate) * 100) },
      };
    }
  }
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m${seconds > 0 ? `${seconds}s` : ''}`;
}

function computeInsightForDeveloper(
  developerName: string,
  reviews: ReviewStats[],
  teamMetrics: TeamMetrics,
): DeveloperInsight {
  const serviceMetrics = computeDeveloperMetrics(reviews);
  const categoryLevels = computeCategoryLevels(reviews, serviceMetrics, teamMetrics);
  const strengths = identifyStrengths(categoryLevels);
  const weaknesses = identifyWeaknesses(categoryLevels);
  const topPriority = identifyTopPriority(categoryLevels);
  const title = computeTitle(categoryLevels);
  const overallLevel = computeOverallLevel(categoryLevels);
  const insightDescriptions = generateInsightDescriptions(
    serviceMetrics,
    teamMetrics,
    strengths,
    weaknesses,
    reviews,
    categoryLevels,
  );

  return {
    developerName,
    title,
    overallLevel,
    categoryLevels,
    strengths,
    weaknesses,
    topPriority,
    reviewCount: reviews.length,
    metrics: {
      averageScore: serviceMetrics.averageScore,
      averageBlocking: serviceMetrics.averageBlocking,
      averageWarnings: serviceMetrics.averageWarnings,
      averageDuration: serviceMetrics.averageDuration,
      totalFollowups: null,
      averageAdditions: computeAverageAdditions(reviews),
      averageDeletions: computeAverageDeletions(reviews),
      firstReviewQualityRate: computeFirstReviewQualityRate(reviews),
    },
    insightDescriptions,
  };
}
