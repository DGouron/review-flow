import {
  reviewsPerMonth,
  type MonthlyVolumePoint,
} from '@/modules/statistics-insights/entities/stats/monthlyVolume.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { formatReviewDuration } from '@/modules/statistics-insights/services/statsService.js';

const EMPTY_MESSAGE = 'Aucune review enregistrée';

export interface AnalyticsHeaderKpi {
  labelKey: string;
  value: string | number;
  delta: null;
}

export interface AnalyticsHeaderViewModel {
  prsReviewed: AnalyticsHeaderKpi;
  bugsCaught: AnalyticsHeaderKpi;
  averageReviewTime: AnalyticsHeaderKpi;
  reviewsPerMonth: MonthlyVolumePoint[];
  isEmpty: boolean;
  emptyMessage: string;
}

export class AnalyticsHeaderPresenter {
  present(stats: ProjectStats, now: Date): AnalyticsHeaderViewModel {
    return {
      prsReviewed: { labelKey: 'stats.kpi.prsReviewed', value: stats.totalReviews, delta: null },
      bugsCaught: {
        labelKey: 'stats.kpi.bugsCaught',
        value: stats.totalBlocking + stats.totalWarnings,
        delta: null,
      },
      averageReviewTime: {
        labelKey: 'stats.kpi.averageReviewTime',
        value: formatReviewDuration(stats.averageDuration),
        delta: null,
      },
      reviewsPerMonth: reviewsPerMonth(stats.reviews, now),
      isEmpty: stats.totalReviews === 0,
      emptyMessage: EMPTY_MESSAGE,
    };
  }
}
