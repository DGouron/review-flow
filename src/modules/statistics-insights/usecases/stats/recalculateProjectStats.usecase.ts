import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';

export interface RecalculateProjectStatsDependencies {
  statsGateway: StatsGateway;
}

export function recalculateProjectStats(
  projectPath: string,
  dependencies: RecalculateProjectStatsDependencies,
): ProjectStats {
  const { statsGateway } = dependencies;

  const stats = statsGateway.loadProjectStats(projectPath);

  if (!stats) {
    const emptyStats: ProjectStats = {
      totalReviews: 0,
      totalDuration: 0,
      averageScore: null,
      averageDuration: 0,
      totalBlocking: 0,
      totalWarnings: 0,
      reviews: [],
      lastUpdated: new Date().toISOString(),
      totalAdditions: 0,
      totalDeletions: 0,
      averageAdditions: 0,
      averageDeletions: 0,
    };
    return emptyStats;
  }

  const { reviews } = stats;

  stats.totalReviews = reviews.length;
  stats.totalDuration = reviews.reduce((sum, review) => sum + review.duration, 0);
  stats.averageDuration = reviews.length > 0 ? stats.totalDuration / reviews.length : 0;
  stats.totalBlocking = reviews.reduce((sum, review) => sum + review.blocking, 0);
  stats.totalWarnings = reviews.reduce((sum, review) => sum + review.warnings, 0);

  const reviewsWithScore = reviews.filter((review) => review.score !== null);
  stats.averageScore =
    reviewsWithScore.length > 0
      ? reviewsWithScore.reduce((sum, review) => sum + (review.score ?? 0), 0) /
        reviewsWithScore.length
      : null;

  const reviewsWithDiffStats = reviews.filter(
    (review) => review.diffStats !== null && review.diffStats !== undefined,
  );

  if (reviewsWithDiffStats.length > 0) {
    stats.totalAdditions = reviewsWithDiffStats.reduce(
      (sum, review) => sum + (review.diffStats?.additions ?? 0),
      0,
    );
    stats.totalDeletions = reviewsWithDiffStats.reduce(
      (sum, review) => sum + (review.diffStats?.deletions ?? 0),
      0,
    );
    stats.averageAdditions = stats.totalAdditions / reviewsWithDiffStats.length;
    stats.averageDeletions = stats.totalDeletions / reviewsWithDiffStats.length;
  } else {
    stats.totalAdditions = 0;
    stats.totalDeletions = 0;
    stats.averageAdditions = 0;
    stats.averageDeletions = 0;
  }

  statsGateway.saveProjectStats(projectPath, stats);

  return stats;
}
