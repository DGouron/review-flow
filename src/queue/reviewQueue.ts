// Strangler Fig: Re-export from new location
// This file will be removed once all imports are updated
export {
  initQueue,
  getQueue,
  shouldDeduplicate,
  markJobProcessed,
  clearJobDeduplication,
  createJobId,
  enqueueReview,
  cancelJob,
  getQueueStats,
  getJobsStatus,
  updateJobProgress,
  setProgressChangeCallback,
  setStateChangeCallback,
  getJobProgress,
} from '../frameworks/queue/pQueueAdapter.js';

export type {
  ReviewJob,
  JobStatus,
  ProgressChangeCallback,
  StateChangeCallback,
} from '../frameworks/queue/pQueueAdapter.js';
