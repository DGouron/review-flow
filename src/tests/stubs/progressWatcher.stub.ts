import type { ProgressWatcher } from '@/modules/review-execution/entities/progress/progressWatcher.gateway.js';

export class ProgressWatcherStub implements ProgressWatcher {
  public started: Array<{ jobId: string; localPath: string; mergeRequestId: string }> = [];
  public stopped: string[] = [];

  start(jobId: string, localPath: string, mergeRequestId: string): void {
    this.started.push({ jobId, localPath, mergeRequestId });
  }

  stop(mergeRequestId: string): void {
    this.stopped.push(mergeRequestId);
  }
}
