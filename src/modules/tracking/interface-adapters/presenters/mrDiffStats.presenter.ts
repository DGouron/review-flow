import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';

/**
 * Diff stats live in project stats (keyed by MR number), not on tracking review
 * events. Enrich each tracked MR's latest review event with the most recent diff
 * stats recorded for that MR number so the dashboard MR detail can show
 * commits/additions/deletions. MRs older than the retained stats window keep null.
 */
export class MrDiffStatsPresenter {
  present(mrs: TrackedMr[], stats: ProjectStats | null): TrackedMr[] {
    if (!stats) return mrs;

    const latestDiffStatsByMrNumber = new Map<number, DiffStats>();
    for (const review of stats.reviews) {
      if (review.diffStats) {
        latestDiffStatsByMrNumber.set(review.mrNumber, review.diffStats);
      }
    }

    return mrs.map((mr) => this.enrichMr(mr, latestDiffStatsByMrNumber));
  }

  private enrichMr(mr: TrackedMr, diffStatsByMrNumber: Map<number, DiffStats>): TrackedMr {
    const diffStats = diffStatsByMrNumber.get(mr.mrNumber);
    if (!diffStats || mr.reviews.length === 0) return mr;

    const lastIndex = mr.reviews.length - 1;
    const reviews = mr.reviews.map((review, index) =>
      index === lastIndex ? { ...review, diffStats } : review,
    );
    return { ...mr, reviews };
  }
}
