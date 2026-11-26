import {
  gradeOfCounts,
  type QualityGrade,
  type ReviewVerdict,
  verdictOfCounts,
} from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';

export interface ReviewOutcome {
  verdict: ReviewVerdict | null;
  grade: QualityGrade | null;
}

const NO_OUTCOME: ReviewOutcome = { verdict: null, grade: null };

export function latestReviewOutcomeOf(mr: Pick<TrackedMr, 'reviews'>): ReviewOutcome {
  const latest = mr.reviews.at(-1);
  if (!latest) return NO_OUTCOME;

  if (latest.verdict !== undefined) {
    return { verdict: latest.verdict, grade: latest.grade ?? null };
  }

  if (latest.score === null) return NO_OUTCOME;
  return { verdict: verdictOfCounts(latest), grade: gradeOfCounts(latest) };
}
