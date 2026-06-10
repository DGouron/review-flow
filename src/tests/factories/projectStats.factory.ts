import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type {
  ProjectStats,
  ReviewStats,
} from '@/modules/statistics-insights/entities/stats/projectStats.js';

export class ReviewStatsFactory {
  static create(overrides: Partial<ReviewStats> = {}): ReviewStats {
    return {
      id: `review-${Date.now()}`,
      timestamp: '2024-01-15T10:00:00Z',
      mrNumber: 42,
      duration: 60000,
      score: 8,
      blocking: 1,
      warnings: 2,
      suggestions: 3,
      assignedBy: 'developer',
      ...overrides,
    };
  }

  static withDiffStats(diffStats: DiffStats, overrides: Partial<ReviewStats> = {}): ReviewStats {
    return this.create({ diffStats, ...overrides });
  }
}

export class ProjectStatsFactory {
  static create(overrides: Partial<ProjectStats> = {}): ProjectStats {
    return {
      totalReviews: 0,
      totalDuration: 0,
      averageScore: null,
      averageDuration: 0,
      totalBlocking: 0,
      totalWarnings: 0,
      totalAdditions: 0,
      totalDeletions: 0,
      averageAdditions: null,
      averageDeletions: null,
      reviews: [],
      lastUpdated: '2024-01-15T10:00:00Z',
      ...overrides,
    };
  }

  static withReviews(reviews: ReviewStats[]): ProjectStats {
    const totalDuration = reviews.reduce((sum, r) => sum + r.duration, 0);
    const reviewsWithScore = reviews.filter((r) => r.score !== null);
    const averageScore =
      reviewsWithScore.length > 0
        ? reviewsWithScore.reduce((sum, r) => sum + (r.score ?? 0), 0) / reviewsWithScore.length
        : null;

    const reviewsWithDiffStats = reviews.filter((r) => r.diffStats != null);
    const totalAdditions = reviewsWithDiffStats.reduce(
      (sum, r) => sum + (r.diffStats?.additions ?? 0),
      0,
    );
    const totalDeletions = reviewsWithDiffStats.reduce(
      (sum, r) => sum + (r.diffStats?.deletions ?? 0),
      0,
    );

    return this.create({
      totalReviews: reviews.length,
      totalDuration,
      averageScore,
      averageDuration: reviews.length > 0 ? totalDuration / reviews.length : 0,
      totalBlocking: reviews.reduce((sum, r) => sum + r.blocking, 0),
      totalWarnings: reviews.reduce((sum, r) => sum + r.warnings, 0),
      totalAdditions,
      totalDeletions,
      averageAdditions:
        reviewsWithDiffStats.length > 0 ? totalAdditions / reviewsWithDiffStats.length : null,
      averageDeletions:
        reviewsWithDiffStats.length > 0 ? totalDeletions / reviewsWithDiffStats.length : null,
      reviews,
    });
  }
}
