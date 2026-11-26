import type { QualityGrade } from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';
import type {
  ProjectStats,
  ReviewStats,
} from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { formatReviewDuration } from '@/modules/statistics-insights/entities/stats/reviewDuration.format.js';
import { readinessOf } from '@/modules/statistics-insights/entities/stats/reviewReadiness.js';
import type { Presenter } from '@/shared/foundation/presenter.base.js';

type Trend = 'up' | 'down' | 'stable';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface StatsPeriod {
  from: string;
  to: string;
  days: number;
}

export interface StatsSummaryViewModel {
  totalReviews: number;
  totalTime: string;
  averageTime: string;
  readyRate: string;
  grades: Record<QualityGrade, number>;
  totalBlocking: number;
  totalWarnings: number;
  bugsDetected: number;
  totalAdditions: number;
  totalDeletions: number;
  totalCommits: number;
  averageAdditions: string;
  averageDeletions: string;
  averageCommits: string;
  totalLinesReviewed: number;
  period: StatsPeriod | null;
  trend: { readiness: Trend; blocking: Trend };
}

function formatPeriodDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function periodOf(reviews: ReviewStats[]): StatsPeriod | null {
  if (reviews.length === 0) return null;
  const times = reviews.map((review) => new Date(review.timestamp).getTime());
  const from = Math.min(...times);
  const to = Math.max(...times);
  return {
    from: formatPeriodDate(from),
    to: formatPeriodDate(to),
    days: Math.round((to - from) / MILLISECONDS_PER_DAY),
  };
}

function averageBlockingOf(reviews: ReviewStats[]): number {
  return reviews.reduce((sum, review) => sum + review.blocking, 0) / reviews.length;
}

const READINESS_TREND_POINTS = 10;

function computeTrend(stats: ProjectStats): { readiness: Trend; blocking: Trend } {
  const recent = stats.reviews.slice(-5);
  const previous = stats.reviews.slice(-10, -5);
  if (recent.length < 3 || previous.length < 3) return { readiness: 'stable', blocking: 'stable' };

  let readiness: Trend = 'stable';
  const rateRecent = readinessOf(recent).readyRate;
  const ratePrevious = readinessOf(previous).readyRate;
  if (rateRecent !== null && ratePrevious !== null) {
    if (rateRecent >= ratePrevious + READINESS_TREND_POINTS) readiness = 'up';
    else if (rateRecent <= ratePrevious - READINESS_TREND_POINTS) readiness = 'down';
  }

  let blocking: Trend = 'stable';
  const blockingRecent = averageBlockingOf(recent);
  const blockingPrev = averageBlockingOf(previous);
  if (blockingRecent < blockingPrev - 0.5) blocking = 'up';
  else if (blockingRecent > blockingPrev + 0.5) blocking = 'down';

  return { readiness, blocking };
}

export class StatsSummaryPresenter implements Presenter<ProjectStats, StatsSummaryViewModel> {
  present(stats: ProjectStats): StatsSummaryViewModel {
    const readiness = readinessOf(stats.reviews);
    return {
      totalReviews: stats.totalReviews,
      totalTime: formatReviewDuration(stats.totalDuration),
      averageTime: formatReviewDuration(stats.averageDuration),
      readyRate: readiness.readyRate !== null ? `${readiness.readyRate}%` : '-',
      grades: readiness.grades,
      totalBlocking: stats.totalBlocking,
      totalWarnings: stats.totalWarnings,
      bugsDetected: stats.totalBlocking + stats.totalWarnings,
      totalAdditions: stats.totalAdditions,
      totalDeletions: stats.totalDeletions,
      totalCommits: stats.totalCommits ?? 0,
      averageAdditions: stats.averageAdditions !== null ? stats.averageAdditions.toFixed(1) : '-',
      averageDeletions: stats.averageDeletions !== null ? stats.averageDeletions.toFixed(1) : '-',
      averageCommits: stats.averageCommits != null ? stats.averageCommits.toFixed(1) : '-',
      totalLinesReviewed: stats.totalAdditions + stats.totalDeletions,
      period: periodOf(stats.reviews),
      trend: computeTrend(stats),
    };
  }
}
