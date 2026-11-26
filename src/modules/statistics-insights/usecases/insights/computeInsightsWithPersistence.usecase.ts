import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type {
  DeveloperInsight,
  CategoryLevels,
  InsightDescription,
} from '@/modules/statistics-insights/entities/insight/developerInsight.js';
import type { InsightCategory } from '@/modules/statistics-insights/entities/insight/insightCategory.js';
import type { InsightTrend } from '@/modules/statistics-insights/entities/insight/insightTrend.js';
import type {
  PersistedInsightsData,
  PersistedDeveloperMetrics,
} from '@/modules/statistics-insights/entities/insight/persistedInsightsData.js';
import type { TeamInsight } from '@/modules/statistics-insights/entities/insight/teamInsight.js';
import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import {
  outcomeOfReviewStats,
  readinessOf,
} from '@/modules/statistics-insights/entities/stats/reviewReadiness.js';
import { computeTeamInsights } from '@/modules/statistics-insights/usecases/insights/computeTeamInsights.usecase.js';
import type {
  DeveloperMetrics as ServiceDeveloperMetrics,
  TeamMetrics,
} from '@/modules/statistics-insights/usecases/insights/insightLevelComputation.service.js';
import {
  MINIMUM_REVIEWS_THRESHOLD,
  ABSOLUTE_BENCHMARKS,
  computeTeamMetrics,
  computeCategoryLevels,
  identifyStrengths,
  identifyWeaknesses,
  identifyTopPriority,
  computeTitle,
  computeOverallLevel,
  computeVolumeGradeCorrelation,
  firstReviewQualityRateOf,
  NEUTRAL_READY_RATE,
} from '@/modules/statistics-insights/usecases/insights/insightLevelComputation.service.js';

const RECENT_REVIEWS_WINDOW = 20;

type DeveloperAccumulators = Omit<PersistedDeveloperMetrics, 'totalScore' | 'scoredReviewCount'> & {
  judgedReviewCount: number;
  readyReviewCount: number;
};

interface InsightsWithPersistenceResult {
  developerInsights: DeveloperInsight[];
  teamInsight: TeamInsight;
  persistedData: PersistedInsightsData;
}

export function computeInsightsWithPersistence(
  reviews: ReviewStats[],
  persistedData: PersistedInsightsData | null,
): InsightsWithPersistenceResult {
  const currentPersistedData = persistedData ?? createEmptyPersistedData();
  const processedIds = new Set(currentPersistedData.processedReviewIds);
  const newReviews = reviews.filter((review) => !processedIds.has(review.id));

  const updatedDevelopers = updateDeveloperMetrics(currentPersistedData.developers, newReviews);
  reconcileDiffStatsFromWindow(updatedDevelopers, reviews);

  const allProcessedIds = [
    ...currentPersistedData.processedReviewIds,
    ...newReviews.map((review) => review.id),
  ];

  const eligibleDevelopers = updatedDevelopers.filter(
    (developer) => developer.totalReviews >= MINIMUM_REVIEWS_THRESHOLD,
  );

  const developerInsights = computeInsightsFromPersistedMetrics(eligibleDevelopers);
  const teamInsight = computeTeamInsights(developerInsights);

  return {
    developerInsights,
    teamInsight,
    persistedData: {
      developers: updatedDevelopers,
      processedReviewIds: allProcessedIds,
      lastUpdated: new Date().toISOString(),
      aiInsights: currentPersistedData.aiInsights ?? null,
      reviewCountAtAiGeneration: currentPersistedData.reviewCountAtAiGeneration ?? 0,
    },
  };
}

function createEmptyPersistedData(): PersistedInsightsData {
  return {
    developers: [],
    processedReviewIds: [],
    lastUpdated: new Date().toISOString(),
    aiInsights: null,
    reviewCountAtAiGeneration: 0,
  };
}

function updateDeveloperMetrics(
  existingDevelopers: PersistedDeveloperMetrics[],
  newReviews: ReviewStats[],
): DeveloperAccumulators[] {
  const developerMap = new Map<string, DeveloperAccumulators>();

  for (const developer of existingDevelopers) {
    developerMap.set(developer.developerName, migrateDeveloper(developer));
  }

  for (const review of newReviews) {
    if (!review.assignedBy) continue;

    const developerName = review.assignedBy;
    const existing = developerMap.get(developerName);

    if (existing) {
      updateExistingDeveloper(existing, review);
    } else {
      developerMap.set(developerName, createDeveloperFromReview(review));
    }
  }

  return Array.from(developerMap.values());
}

/** Drops the legacy score accumulators; files written before verdicts are seeded from their recent reviews. */
function migrateDeveloper(developer: PersistedDeveloperMetrics): DeveloperAccumulators {
  const {
    totalScore: _legacyTotalScore,
    scoredReviewCount: _legacyScoredReviewCount,
    judgedReviewCount,
    readyReviewCount,
    ...accumulators
  } = developer;
  const isLegacy = judgedReviewCount === undefined || readyReviewCount === undefined;
  const seeded = isLegacy
    ? readinessOf(developer.recentReviews)
    : { judged: judgedReviewCount, ready: readyReviewCount };

  return {
    ...accumulators,
    judgedReviewCount: seeded.judged,
    readyReviewCount: seeded.ready,
    recentReviews: [...developer.recentReviews],
  };
}

function updateExistingDeveloper(developer: DeveloperAccumulators, review: ReviewStats): void {
  developer.totalReviews += 1;
  developer.totalBlocking += review.blocking;
  developer.totalWarnings += review.warnings;
  developer.totalSuggestions += review.suggestions ?? 0;
  developer.totalDuration += review.duration;

  const { verdict } = outcomeOfReviewStats(review);
  if (verdict !== null) {
    developer.judgedReviewCount += 1;
    if (verdict === 'ready') developer.readyReviewCount += 1;
  }

  developer.recentReviews.push(review);
  if (developer.recentReviews.length > RECENT_REVIEWS_WINDOW) {
    developer.recentReviews = developer.recentReviews.slice(-RECENT_REVIEWS_WINDOW);
  }
}

function createDeveloperFromReview(review: ReviewStats): DeveloperAccumulators {
  const { judged, ready } = readinessOf([review]);
  return {
    developerName: review.assignedBy ?? '',
    totalReviews: 1,
    judgedReviewCount: judged,
    readyReviewCount: ready,
    totalBlocking: review.blocking,
    totalWarnings: review.warnings,
    totalSuggestions: review.suggestions ?? 0,
    totalDuration: review.duration,
    totalAdditions: 0,
    totalDeletions: 0,
    diffStatsReviewCount: 0,
    recentReviews: [review],
  };
}

/**
 * Diff stats are only retained for the rolling window of recent reviews kept in
 * project stats. Recompute each developer's diff-stat aggregates from that window
 * so backfilled diff stats on already-processed reviews are picked up, and refresh
 * the per-developer recentReviews so volume/grade correlation can be computed.
 * Developers with no review in the window keep their previously persisted values.
 */
function reconcileDiffStatsFromWindow(
  developers: DeveloperAccumulators[],
  windowReviews: ReviewStats[],
): void {
  if (windowReviews.length === 0) return;

  const windowReviewsByDeveloper = new Map<string, ReviewStats[]>();
  const diffStatsByReviewId = new Map<string, DiffStats>();
  for (const review of windowReviews) {
    if (review.diffStats) {
      diffStatsByReviewId.set(review.id, review.diffStats);
    }
    if (!review.assignedBy) continue;
    const reviewsForDeveloper = windowReviewsByDeveloper.get(review.assignedBy) ?? [];
    reviewsForDeveloper.push(review);
    windowReviewsByDeveloper.set(review.assignedBy, reviewsForDeveloper);
  }

  for (const developer of developers) {
    const reviewsForDeveloper = windowReviewsByDeveloper.get(developer.developerName);
    if (reviewsForDeveloper) {
      developer.totalAdditions = 0;
      developer.totalDeletions = 0;
      developer.diffStatsReviewCount = 0;
      for (const review of reviewsForDeveloper) {
        if (!review.diffStats) continue;
        developer.totalAdditions += review.diffStats.additions;
        developer.totalDeletions += review.diffStats.deletions;
        developer.diffStatsReviewCount += 1;
      }
    }
    developer.recentReviews = developer.recentReviews.map((review) => {
      const diffStats = diffStatsByReviewId.get(review.id);
      return diffStats ? { ...review, diffStats } : review;
    });
  }
}

function computeInsightsFromPersistedMetrics(
  developers: DeveloperAccumulators[],
): DeveloperInsight[] {
  if (developers.length === 0) {
    return [];
  }

  const reviewsByDeveloper = buildReviewsByDeveloperMap(developers);

  const isSingleDeveloper = developers.length === 1;
  const teamMetrics = isSingleDeveloper
    ? ABSOLUTE_BENCHMARKS
    : computeTeamMetrics(reviewsByDeveloper);

  const insights: DeveloperInsight[] = [];

  for (const developer of developers) {
    const serviceMetrics = buildDeveloperMetricsFromCumulative(developer);
    const trendReviews = developer.recentReviews;
    const categoryLevels = computeCategoryLevels(trendReviews, serviceMetrics, teamMetrics);
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
      trendReviews,
      categoryLevels,
    );

    const averageAdditions =
      developer.diffStatsReviewCount > 0
        ? developer.totalAdditions / developer.diffStatsReviewCount
        : 0;
    const averageDeletions =
      developer.diffStatsReviewCount > 0
        ? developer.totalDeletions / developer.diffStatsReviewCount
        : 0;

    insights.push({
      developerName: developer.developerName,
      title,
      overallLevel,
      categoryLevels,
      strengths,
      weaknesses,
      topPriority,
      reviewCount: developer.totalReviews,
      metrics: {
        averageBlocking: serviceMetrics.averageBlocking,
        averageWarnings: serviceMetrics.averageWarnings,
        averageDuration: serviceMetrics.averageDuration,
        totalFollowups: null,
        averageAdditions,
        averageDeletions,
        firstReviewQualityRate: firstReviewQualityRateOf(trendReviews),
      },
      insightDescriptions,
    });
  }

  return insights;
}

function buildReviewsByDeveloperMap(
  developers: DeveloperAccumulators[],
): Map<string, ReviewStats[]> {
  const map = new Map<string, ReviewStats[]>();

  for (const developer of developers) {
    map.set(developer.developerName, developer.recentReviews);
  }

  return map;
}

function buildDeveloperMetricsFromCumulative(
  developer: DeveloperAccumulators,
): ServiceDeveloperMetrics {
  const readyRate =
    developer.judgedReviewCount > 0
      ? developer.readyReviewCount / developer.judgedReviewCount
      : NEUTRAL_READY_RATE;
  const averageBlocking =
    developer.totalReviews > 0 ? developer.totalBlocking / developer.totalReviews : 0;
  const averageWarnings =
    developer.totalReviews > 0 ? developer.totalWarnings / developer.totalReviews : 0;
  const averageDuration =
    developer.totalReviews > 0 ? developer.totalDuration / developer.totalReviews : 0;
  const averageCodeVolume =
    developer.diffStatsReviewCount > 0
      ? (developer.totalAdditions + developer.totalDeletions) / developer.diffStatsReviewCount
      : 0;

  return {
    readyRate,
    averageBlocking,
    averageWarnings,
    averageDuration,
    averageCodeVolume,
    codeVolumeGradeCorrelation: computeVolumeGradeCorrelation(developer.recentReviews),
  };
}

function computePercentDifference(value: number, teamAverage: number): number {
  if (teamAverage === 0) return 0;
  return Math.round(((value - teamAverage) / teamAverage) * 100);
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m${seconds > 0 ? `${seconds}s` : ''}`;
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
      const percent = computePercentDifference(metrics.readyRate, teamMetrics.readyRate);
      return {
        category: 'quality',
        type: 'strength',
        descriptionKey: 'insight.quality.highReadiness',
        params: {
          readyRate: Math.round(metrics.readyRate * 100),
          teamReadyRate: Math.round(teamMetrics.readyRate * 100),
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
      const qualityRate = firstReviewQualityRateOf(reviews);
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
      const qualityRate = firstReviewQualityRateOf(reviews);
      return {
        category: 'iteration',
        type: 'weakness',
        descriptionKey: 'insight.iteration.poor',
        params: { rate: Math.round((1 - qualityRate) * 100) },
      };
    }
  }
}
