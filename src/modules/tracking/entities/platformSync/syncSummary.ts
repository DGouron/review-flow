/**
 * Outcome of the last reconciliation between the tracked review requests and the platform.
 * `removedClosed` counts the requests that left the active buckets because the platform
 * reports them closed or merged; `untrackedOpen` counts the requests open on the platform
 * that ReviewFlow does not track as active (tracking starts at the first review request).
 */
export type SyncSummary = {
  syncedAt: string;
  removedClosed: number;
  untrackedOpen: number;
};
