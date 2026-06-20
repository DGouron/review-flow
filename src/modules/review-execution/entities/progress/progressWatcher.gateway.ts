export interface ProgressWatcher {
  start(jobId: string, localPath: string, mergeRequestId: string): void;
  stop(mergeRequestId: string): void;
}
