import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type {
  ClaudeReviewInvoker,
  ClaudeReviewResult,
  ReviewProgressCallback,
} from '@/modules/review-execution/entities/review/claudeReviewInvoker.gateway.js';

export class ClaudeReviewInvokerStub implements ClaudeReviewInvoker {
  private result: ClaudeReviewResult = {
    success: true,
    cancelled: false,
    exitCode: 0,
    stdout: '',
    stderr: '',
    durationMs: 0,
  };

  public invocations: Array<{ job: ReviewJob; signal: AbortSignal }> = [];

  private duringInvoke: ((job: ReviewJob) => void) | null = null;

  setResult(result: ClaudeReviewResult): void {
    this.result = result;
  }

  onInvoke(handler: (job: ReviewJob) => void): void {
    this.duringInvoke = handler;
  }

  async invoke(
    job: ReviewJob,
    _onProgress: ReviewProgressCallback,
    signal: AbortSignal,
  ): Promise<ClaudeReviewResult> {
    this.invocations.push({ job, signal });
    if (this.duringInvoke) {
      this.duringInvoke(job);
    }
    return this.result;
  }
}
