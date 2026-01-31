import type { ReviewJob } from '../../queue/reviewQueue.js';
import type { ReviewQueuePort } from '../../usecases/triggerReview.usecase.js';
import type { CancelReviewQueuePort } from '../../usecases/cancelReview.usecase.js';

type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export class StubReviewQueuePort implements ReviewQueuePort, CancelReviewQueuePort {
  private jobStatuses = new Map<string, JobStatus>();
  public enqueuedJobs: ReviewJob[] = [];
  public shouldRejectEnqueue = false;
  public cancelledJobs: string[] = [];

  hasActiveJob(jobId: string): boolean {
    const status = this.jobStatuses.get(jobId);
    return status === 'queued' || status === 'running';
  }

  enqueue(job: ReviewJob): boolean {
    if (this.shouldRejectEnqueue) {
      return false;
    }
    this.enqueuedJobs.push(job);
    this.jobStatuses.set(job.id, 'queued');
    return true;
  }

  createJobId(platform: string, projectPath: string, mrNumber: number): string {
    return `${platform}:${projectPath}:${mrNumber}`;
  }

  getJobStatus(jobId: string): JobStatus | null {
    return this.jobStatuses.get(jobId) ?? null;
  }

  cancelJob(jobId: string): boolean {
    const status = this.jobStatuses.get(jobId);
    if (status === 'queued' || status === 'running') {
      this.jobStatuses.delete(jobId);
      this.cancelledJobs.push(jobId);
      return true;
    }
    return false;
  }

  addActiveJob(jobId: string, status: JobStatus = 'running'): void {
    this.jobStatuses.set(jobId, status);
  }

  setJobStatus(jobId: string, status: JobStatus): void {
    this.jobStatuses.set(jobId, status);
  }

  clear(): void {
    this.jobStatuses.clear();
    this.enqueuedJobs = [];
    this.cancelledJobs = [];
    this.shouldRejectEnqueue = false;
  }
}
