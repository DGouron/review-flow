import type {
  ProjectStats,
  ReviewStats,
} from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { formatReviewDuration } from '@/modules/statistics-insights/entities/stats/reviewDuration.format.js';
import type { Presenter } from '@/shared/foundation/presenter.base.js';

type Trend = 'up' | 'down' | 'stable';

export interface StatsSummaryViewModel {
  totalReviews: number;
  totalTime: string;
  averageTime: string;
  averageScore: string;
  totalBlocking: number;
  totalWarnings: number;
  totalAdditions: number;
  totalDeletions: number;
  totalCommits: number;
  averageAdditions: string;
  averageDeletions: string;
  averageCommits: string;
  totalLinesReviewed: number;
  trend: { score: Trend; blocking: Trend };
}

function averageScoreOf(reviews: ReviewStats[]): number | null {
  const scored = reviews.filter((review) => review.score !== null);
  if (scored.length === 0) return null;
  return scored.reduce((sum, review) => sum + (review.score ?? 0), 0) / scored.length;
}

function averageBlockingOf(reviews: ReviewStats[]): number {
  return reviews.reduce((sum, review) => sum + review.blocking, 0) / reviews.length;
}

function computeTrend(stats: ProjectStats): { score: Trend; blocking: Trend } {
  const recent = stats.reviews.slice(-5);
  const previous = stats.reviews.slice(-10, -5);
  if (recent.length < 3 || previous.length < 3) return { score: 'stable', blocking: 'stable' };

  let score: Trend = 'stable';
  const avgRecent = averageScoreOf(recent);
  const avgPrev = averageScoreOf(previous);
  if (avgRecent !== null && avgPrev !== null) {
    if (avgRecent > avgPrev + 0.5) score = 'up';
    else if (avgRecent < avgPrev - 0.5) score = 'down';
  }

  let blocking: Trend = 'stable';
  const blockingRecent = averageBlockingOf(recent);
  const blockingPrev = averageBlockingOf(previous);
  if (blockingRecent < blockingPrev - 0.5) blocking = 'up';
  else if (blockingRecent > blockingPrev + 0.5) blocking = 'down';

  return { score, blocking };
}

export class StatsSummaryPresenter implements Presenter<ProjectStats, StatsSummaryViewModel> {
  present(stats: ProjectStats): StatsSummaryViewModel {
    return {
      totalReviews: stats.totalReviews,
      totalTime: formatReviewDuration(stats.totalDuration),
      averageTime: formatReviewDuration(stats.averageDuration),
      averageScore: stats.averageScore !== null ? stats.averageScore.toFixed(1) : '-',
      totalBlocking: stats.totalBlocking,
      totalWarnings: stats.totalWarnings,
      totalAdditions: stats.totalAdditions,
      totalDeletions: stats.totalDeletions,
      totalCommits: stats.totalCommits ?? 0,
      averageAdditions: stats.averageAdditions !== null ? stats.averageAdditions.toFixed(1) : '-',
      averageDeletions: stats.averageDeletions !== null ? stats.averageDeletions.toFixed(1) : '-',
      averageCommits: stats.averageCommits != null ? stats.averageCommits.toFixed(1) : '-',
      totalLinesReviewed: stats.totalAdditions + stats.totalDeletions,
      trend: computeTrend(stats),
    };
  }
}
