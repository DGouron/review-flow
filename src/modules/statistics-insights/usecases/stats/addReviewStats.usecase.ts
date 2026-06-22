import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import {
  BUG_CATEGORY_KEYS,
  emptyBreakdown,
  type CategoryBreakdown,
} from '@/modules/statistics-insights/entities/stats/bugCategory.js';
import {
  createEmptyStats,
  type ProjectStats,
  type ReviewStats,
} from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { ParsedReviewOutput } from '@/modules/statistics-insights/entities/stats/reviewOutput.parser.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

const MAX_RETAINED_REVIEWS = 100;

export interface AddReviewStatsInput {
  projectPath: string;
  mrNumber: number;
  duration: number;
  parsed: ParsedReviewOutput;
  assignedBy?: string;
  diffStats?: DiffStats | null;
}

export class AddReviewStatsUseCase implements UseCase<AddReviewStatsInput, ReviewStats> {
  constructor(private readonly statsGateway: StatsGateway) {}

  execute(input: AddReviewStatsInput): ReviewStats {
    const stats = this.statsGateway.loadProjectStats(input.projectPath) ?? createEmptyStats();

    const now = new Date();
    const reviewStats: ReviewStats = {
      id: `${now.getTime()}-${input.mrNumber}`,
      timestamp: now.toISOString(),
      mrNumber: input.mrNumber,
      duration: input.duration,
      score: input.parsed.score,
      blocking: input.parsed.blocking,
      warnings: input.parsed.warnings,
      suggestions: input.parsed.suggestions,
      assignedBy: input.assignedBy,
      diffStats: input.diffStats ?? null,
      categoryBreakdown: input.parsed.categoryBreakdown,
    };

    initializeCumulativeCounters(stats);

    stats.reviews.push(reviewStats);
    updateAggregatesForNewReview(stats, reviewStats);

    if (stats.reviews.length > MAX_RETAINED_REVIEWS) {
      stats.reviews = stats.reviews.slice(-MAX_RETAINED_REVIEWS);
    }

    this.statsGateway.saveProjectStats(input.projectPath, stats);

    return reviewStats;
  }
}

function addBreakdown(target: CategoryBreakdown, contribution: CategoryBreakdown): void {
  for (const key of BUG_CATEGORY_KEYS) {
    target[key] += contribution[key];
  }
}

function initializeCumulativeCounters(stats: ProjectStats): void {
  if (stats.categoryBreakdown === undefined) {
    const aggregate = emptyBreakdown();
    for (const review of stats.reviews) {
      if (review.categoryBreakdown != null) {
        addBreakdown(aggregate, review.categoryBreakdown);
      }
    }
    stats.categoryBreakdown = aggregate;
  }

  if (stats.totalScoreSum !== undefined) return;

  const reviewsWithScore = stats.reviews.filter((review) => review.score !== null);
  stats.totalScoreSum = reviewsWithScore.reduce((sum, review) => sum + (review.score ?? 0), 0);
  stats.scoredReviewCount = reviewsWithScore.length;

  const reviewsWithDiffStats = stats.reviews.filter((review) => review.diffStats != null);
  stats.diffStatsReviewCount = reviewsWithDiffStats.length;
}

function updateAggregatesForNewReview(stats: ProjectStats, review: ReviewStats): void {
  stats.totalReviews += 1;
  stats.totalDuration += review.duration;
  stats.averageDuration = stats.totalDuration / stats.totalReviews;
  stats.totalBlocking += review.blocking;
  stats.totalWarnings += review.warnings;

  if (review.score !== null) {
    stats.totalScoreSum = (stats.totalScoreSum ?? 0) + review.score;
    stats.scoredReviewCount = (stats.scoredReviewCount ?? 0) + 1;
  }

  if (stats.scoredReviewCount && stats.scoredReviewCount > 0) {
    stats.averageScore = (stats.totalScoreSum ?? 0) / stats.scoredReviewCount;
  }

  if (review.diffStats) {
    stats.totalAdditions += review.diffStats.additions;
    stats.totalDeletions += review.diffStats.deletions;
    stats.totalCommits = (stats.totalCommits ?? 0) + review.diffStats.commitsCount;
    stats.diffStatsReviewCount = (stats.diffStatsReviewCount ?? 0) + 1;
  }

  if (stats.diffStatsReviewCount && stats.diffStatsReviewCount > 0) {
    stats.averageAdditions = stats.totalAdditions / stats.diffStatsReviewCount;
    stats.averageDeletions = stats.totalDeletions / stats.diffStatsReviewCount;
    stats.averageCommits = (stats.totalCommits ?? 0) / stats.diffStatsReviewCount;
  }

  if (review.categoryBreakdown != null) {
    stats.categoryBreakdown = stats.categoryBreakdown ?? emptyBreakdown();
    addBreakdown(stats.categoryBreakdown, review.categoryBreakdown);
  }
}
