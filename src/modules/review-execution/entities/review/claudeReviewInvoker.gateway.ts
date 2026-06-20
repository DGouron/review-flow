import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type {
  ProgressEvent,
  ReviewProgress,
} from '@/modules/review-execution/entities/progress/progress.type.js';

export interface ClaudeReviewResult {
  success: boolean;
  cancelled?: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type ReviewProgressCallback = (progress: ReviewProgress, event?: ProgressEvent) => void;

export interface ClaudeReviewInvoker {
  invoke(
    job: ReviewJob,
    onProgress: ReviewProgressCallback,
    signal: AbortSignal,
  ): Promise<ClaudeReviewResult>;
}
