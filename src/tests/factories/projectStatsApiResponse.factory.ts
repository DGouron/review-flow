import type {
  ProjectStats,
  ReviewStats,
} from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { OverviewProjectStatsEntry } from '@/modules/statistics-insights/interface-adapters/presenters/overview.presenter.js';

export interface ProjectStatsApiResponseOverrides {
  project?: string;
  path?: string;
  totalReviews?: number;
  averageScore?: number | null;
  reviews?: ReviewStats[];
  averageDuration?: number;
  totalBlocking?: number;
  totalWarnings?: number;
}

export class ProjectStatsApiResponseFactory {
  static create(overrides: ProjectStatsApiResponseOverrides = {}): OverviewProjectStatsEntry {
    const project = overrides.project ?? 'sample-project';
    const path = overrides.path ?? '/repos/sample-project';
    const reviews = overrides.reviews ?? [];
    const totalReviews = overrides.totalReviews ?? reviews.length;
    const averageScore = overrides.averageScore ?? null;
    const averageDuration = overrides.averageDuration ?? 0;
    const totalBlocking = overrides.totalBlocking ?? 0;
    const totalWarnings = overrides.totalWarnings ?? 0;

    const stats: ProjectStats = {
      totalReviews,
      totalDuration: 0,
      averageScore,
      averageDuration,
      totalBlocking,
      totalWarnings,
      totalAdditions: 0,
      totalDeletions: 0,
      averageAdditions: null,
      averageDeletions: null,
      reviews,
      lastUpdated: '2026-05-25T12:00:00.000Z',
    };

    return {
      project,
      path,
      stats,
      summary: {
        totalReviews,
        averageScore,
        averageDuration,
        totalBlocking,
        totalWarnings,
      },
    };
  }
}
