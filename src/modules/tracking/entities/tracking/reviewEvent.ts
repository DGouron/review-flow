import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type {
  QualityGrade,
  ReviewVerdict,
} from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';

export interface ReviewEvent {
  type: 'review' | 'followup';
  timestamp: string;
  durationMs: number;
  score: number | null;
  blocking: number;
  warnings: number;
  suggestions: number;
  threadsClosed: number;
  threadsOpened: number;
  diffStats: DiffStats | null;
  /** Absent on events recorded before verdicts: read them through latestReviewOutcomeOf. */
  verdict?: ReviewVerdict | null;
  grade?: QualityGrade | null;
}
