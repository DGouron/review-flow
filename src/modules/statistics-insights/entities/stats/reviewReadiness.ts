import {
  gradeOfCounts,
  QUALITY_GRADES,
  type QualityGrade,
  type ReviewVerdict,
  verdictOfCounts,
} from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';
import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';

export interface ReviewOutcome {
  verdict: ReviewVerdict | null;
  grade: QualityGrade | null;
}

export interface Readiness {
  judged: number;
  ready: number;
  /** Percentage of judged reviews whose verdict is ready, rounded. */
  readyRate: number | null;
  grades: Record<QualityGrade, number>;
}

export function outcomeOfReviewStats(review: ReviewStats): ReviewOutcome {
  if (review.verdict !== undefined) {
    return { verdict: review.verdict, grade: review.grade ?? null };
  }
  if (review.score === null) return { verdict: null, grade: null };
  const counts = { ...review, suggestions: review.suggestions ?? 0 };
  return { verdict: verdictOfCounts(counts), grade: gradeOfCounts(counts) };
}

export function readinessOf(reviews: readonly ReviewStats[]): Readiness {
  const grades: Record<QualityGrade, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let judged = 0;
  let ready = 0;

  for (const review of reviews) {
    const outcome = outcomeOfReviewStats(review);
    if (outcome.verdict === null) continue;
    judged += 1;
    if (outcome.verdict === 'ready') ready += 1;
    if (outcome.grade !== null) grades[outcome.grade] += 1;
  }

  return {
    judged,
    ready,
    readyRate: judged === 0 ? null : Math.round((ready / judged) * 100),
    grades,
  };
}

/** Ordinal rank of a grade, A highest: an internal measure, never shown as a score. */
export function gradeRank(grade: QualityGrade): number {
  return QUALITY_GRADES.length - 1 - QUALITY_GRADES.indexOf(grade);
}
