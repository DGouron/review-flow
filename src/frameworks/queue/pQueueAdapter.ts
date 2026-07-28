import PQueue from 'p-queue';
import type { Logger } from 'pino';

import { loadConfig } from '@/frameworks/config/configLoader.js';
import { ProjectSemaphore } from '@/frameworks/queue/projectSemaphore.js';
import { getReviewTimeoutMs } from '@/frameworks/settings/runtimeSettings.js';
import type { JobStatus, ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type {
  ReviewProgress,
  ProgressEvent,
} from '@/modules/review-execution/entities/progress/progress.type.js';

// Deduplication tracking
const recentJobs = new Map<string, number>(); // jobId -> timestamp

// Abort controllers for cancellation
const jobAbortControllers = new Map<string, AbortController>();

// Progress change callback type
export type ProgressChangeCallback = (
  jobId: string,
  progress: ReviewProgress,
  event?: ProgressEvent,
) => void;

// State change callback type - called when jobs are added/started/completed/failed
export type StateChangeCallback = () => void;

// Persist job record callback type - fired in the completion finally block.
// Best-effort: implementations must never throw nor delay the queue task.
export type PersistJobRecordCallback = (
  jobStatus: JobStatus,
  abortSignalAborted: boolean,
) => Promise<void>;

// Global progress change listener
let progressChangeCallback: ProgressChangeCallback | null = null;

// Global state change listener
let stateChangeCallback: StateChangeCallback | null = null;

// Global persist callback (wired by composition root)
let persistJobRecordCallback: PersistJobRecordCallback | null = null;

const activeJobs = new Map<string, JobStatus>();
const completedJobs: JobStatus[] = []; // Keep last 20
const MAX_COMPLETED_JOBS = 20;

// SPEC-170 FR-9: MR-scoped chain so fresh + followup on the same MR serialize.
// Key format: <platform>:<projectPath>:<mrNumber>  (jobType prefix stripped).
// Value: the tail promise of the chain for that MR. New enqueues await it
// before adding their processor to PQueue.
const mrChains = new Map<string, Promise<void>>();

export function __getMrChainsSize(): number {
  return mrChains.size;
}

function createMrConcurrencyKey(platform: string, projectPath: string, mrNumber: number): string {
  return `${platform}:${projectPath}:${mrNumber}`;
}

// SPEC-186: per-project semaphore gates concurrent reviews for a given project.
// Sits between the MR-chain wait and PQueue.add(): waits for available cap,
// then proceeds. Decrement happens in the same finally block as activeJobs cleanup.
const projectSemaphore = new ProjectSemaphore();
const projectCaps = new Map<string, number>();

export function setProjectConcurrencyCap(projectPath: string, cap: number): void {
  projectCaps.set(projectPath, cap);
  projectSemaphore.setCapacity(projectPath, cap);
}

export function setGlobalConcurrency(value: number): void {
  if (queue) {
    queue.concurrency = value;
  }
}

export function getRunningCount(): number {
  return projectSemaphore.totalRunning();
}

export function getTotalCapacity(): number {
  let total = 0;
  for (const cap of projectCaps.values()) total += cap;
  return total;
}

export function __resetProjectConcurrencyState(): void {
  projectCaps.clear();
}

let queue: PQueue | null = null;
let logger: Logger | null = null;

const JOB_TIMEOUT_GRACE_MS = 5 * 60 * 1000;

/**
 * The queue must outlive the Claude session it wraps, otherwise PQueue aborts
 * the job before awaitSessionCompletion can report a `timeout` reason. The
 * grace margin covers worktree preparation, report reading and stats writes.
 */
export function computeJobTimeoutMs(reviewTimeoutMs: number): number {
  return reviewTimeoutMs + JOB_TIMEOUT_GRACE_MS;
}

export function setJobTimeoutMs(value: number): void {
  if (queue) {
    queue.timeout = value;
  }
}

export function initQueue(log: Logger): PQueue {
  const config = loadConfig();
  logger = log;

  const createdQueue = new PQueue({
    concurrency: config.queue.maxConcurrent,
    timeout: computeJobTimeoutMs(getReviewTimeoutMs()),
    throwOnTimeout: true,
  });
  queue = createdQueue;

  // Log queue events
  createdQueue.on('active', () => {
    log.info({ pending: createdQueue.pending, size: createdQueue.size }, 'Job started');
  });

  createdQueue.on('idle', () => {
    log.info('Queue is idle');
  });

  createdQueue.on('error', (error) => {
    log.error({ error }, 'Queue error');
  });

  // Cleanup old deduplication entries periodically
  setInterval(() => {
    cleanupDeduplication();
  }, 60000); // Every minute

  return createdQueue;
}

export function getQueue(): PQueue {
  if (!queue) {
    throw new Error("Queue non initialisée. Appelez initQueue() d'abord.");
  }
  return queue;
}

/**
 * Check if a job should be deduplicated
 */
export function shouldDeduplicate(jobId: string): boolean {
  const config = loadConfig();
  const lastRun = recentJobs.get(jobId);

  if (!lastRun) {
    return false;
  }

  const elapsed = Date.now() - lastRun;
  return elapsed < config.queue.deduplicationWindowMs;
}

/**
 * Mark a job as recently processed
 */
export function markJobProcessed(jobId: string): void {
  recentJobs.set(jobId, Date.now());
}

/**
 * Clear deduplication entry for a job (allows retry after failure)
 */
export function clearJobDeduplication(jobId: string): void {
  recentJobs.delete(jobId);
}

/**
 * Create a unique job ID
 */
export function createJobId(platform: string, projectPath: string, mrNumber: number): string {
  return `${platform}:${projectPath}:${mrNumber}`;
}

/**
 * Add a review job to the queue
 * @param job - The review job to add
 * @param processor - Function to process the job, receives AbortSignal for cancellation
 */
export async function enqueueReview(
  job: ReviewJob,
  processor: (job: ReviewJob, signal: AbortSignal) => Promise<void>,
): Promise<boolean> {
  const q = getQueue();
  if (!logger) {
    throw new Error("Queue non initialisée. Appelez initQueue() d'abord.");
  }
  const log = logger;

  // Check deduplication (only blocks if a previous job SUCCEEDED recently)
  if (shouldDeduplicate(job.id)) {
    log.info({ jobId: job.id }, 'Job dédupliqué, ignoré');
    return false;
  }

  // Check if job is already active (prevent concurrent runs of same MR)
  if (activeJobs.has(job.id)) {
    log.info({ jobId: job.id }, 'Job déjà en cours, ignoré');
    return false;
  }

  // Create abort controller for this job
  const abortController = new AbortController();
  jobAbortControllers.set(job.id, abortController);

  // Track job status
  const jobStatus: JobStatus = {
    job,
    status: 'queued',
  };
  activeJobs.set(job.id, jobStatus);

  // Notify state change (job queued)
  stateChangeCallback?.();

  log.info(
    {
      jobId: job.id,
      mrNumber: job.mrNumber,
      skill: job.skill,
      queueSize: q.size,
      pending: q.pending,
    },
    'Job ajouté à la queue',
  );

  // SPEC-170 FR-9: MR-scoped serialization. fresh + followup on the same MR
  // queue behind each other; different MRs still run in parallel within PQueue
  // concurrency.
  // SPEC-186: after the MR-chain wait, the per-project semaphore gates entry
  // into PQueue.add() so a single project cannot saturate the global queue.
  const mrKey = createMrConcurrencyKey(job.platform, job.projectPath, job.mrNumber);
  const previousTail = mrChains.get(mrKey) ?? Promise.resolve();

  const newTail: Promise<void> = (async () => {
    await previousTail;
    await projectSemaphore.acquire(job.projectPath);
    await q.add(async () => {
      jobStatus.status = 'running';
      jobStatus.startedAt = new Date();
      log.info({ jobId: job.id }, 'Début du traitement');

      // Notify state change (job started)
      stateChangeCallback?.();

      try {
        await processor(job, abortController.signal);
        jobStatus.status = abortController.signal.aborted ? 'failed' : 'completed';
        jobStatus.completedAt = new Date();
        if (abortController.signal.aborted) {
          jobStatus.error = 'Annulé par utilisateur';
          // Clear deduplication on cancel to allow retry
          clearJobDeduplication(job.id);
          log.info({ jobId: job.id }, 'Traitement annulé');
        } else {
          // Only mark as processed on SUCCESS (prevents failed jobs from blocking retries)
          markJobProcessed(job.id);
          log.info({ jobId: job.id }, 'Traitement terminé avec succès');
        }
      } catch (error) {
        jobStatus.status = 'failed';
        jobStatus.completedAt = new Date();
        jobStatus.error = error instanceof Error ? error.message : String(error);
        // Clear deduplication on failure to allow retry
        clearJobDeduplication(job.id);
        log.error({ jobId: job.id, error }, 'Erreur pendant le traitement');
      } finally {
        // Cleanup abort controller
        jobAbortControllers.delete(job.id);
        // Move to completed jobs
        activeJobs.delete(job.id);
        completedJobs.unshift(jobStatus);
        if (completedJobs.length > MAX_COMPLETED_JOBS) {
          completedJobs.pop();
        }
        // SPEC-186: release the per-project slot in the same finally block as
        // the MR-chain teardown so a project never holds a phantom slot after a
        // crash or abort.
        projectSemaphore.release(job.projectPath);

        // Best-effort persistence (SPEC-176): fire the callback without
        // awaiting and swallow any rejection so the queue task is never
        // delayed nor failed by a disk write.
        const persistPromise = persistJobRecordCallback?.(
          jobStatus,
          abortController.signal.aborted,
        );
        if (persistPromise) {
          persistPromise.catch(() => {});
        }

        // Notify state change (job completed/failed)
        stateChangeCallback?.();
      }
    });
  })();

  mrChains.set(mrKey, newTail);

  // The inner try/catch/finally swallows processor errors (jobStatus is set to
  // 'failed' and logged there), so newTail never rejects. We only need finally
  // to release the MR chain entry (R4 leak fix).
  const releaseMrChainEntry = async (): Promise<void> => {
    try {
      await newTail;
    } finally {
      if (mrChains.get(mrKey) === newTail) {
        mrChains.delete(mrKey);
      }
    }
  };
  void releaseMrChainEntry();

  return true;
}

/**
 * Get job status by ID
 */
export function getJobStatus(jobId: string): 'queued' | 'running' | 'completed' | 'failed' | null {
  const active = activeJobs.get(jobId);
  if (active) {
    return active.status;
  }

  const completed = completedJobs.find((job) => job.job.id === jobId);
  if (completed) {
    return completed.status;
  }

  return null;
}

/**
 * Cancel a running or queued job
 * @returns true if the job was found and cancelled, false otherwise
 */
export function cancelJob(jobId: string): boolean {
  const abortController = jobAbortControllers.get(jobId);
  if (abortController) {
    abortController.abort();
    logger?.info({ jobId }, 'Job annulation demandée');
    return true;
  }
  logger?.warn({ jobId }, 'Job non trouvé pour annulation');
  return false;
}

/**
 * Clean up old deduplication entries
 */
function cleanupDeduplication(): void {
  const config = loadConfig();
  const now = Date.now();
  const windowMs = config.queue.deduplicationWindowMs;

  for (const [jobId, timestamp] of recentJobs.entries()) {
    if (now - timestamp > windowMs) {
      recentJobs.delete(jobId);
    }
  }
}

/**
 * Get queue stats
 */
export function getQueueStats(): { size: number; pending: number; recentJobs: number } {
  const q = queue;
  return {
    size: q?.size ?? 0,
    pending: q?.pending ?? 0,
    recentJobs: recentJobs.size,
  };
}

/**
 * Get detailed status of all jobs
 */
export function getJobsStatus(): {
  active: Array<{
    id: string;
    mrNumber: number;
    project: string;
    mrUrl: string;
    status: string;
    startedAt?: string;
    progress?: ReviewProgress;
    title?: string;
    description?: string;
    assignedBy?: { username: string; displayName?: string };
    author?: { username: string; displayName?: string };
    sizeMetrics?: {
      additions: number | null;
      deletions: number | null;
      filesChanged: number | null;
    };
    jobType?: 'review' | 'followup';
  }>;
  recent: Array<{
    id: string;
    mrNumber: number;
    project: string;
    mrUrl: string;
    status: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
    progress?: ReviewProgress;
    title?: string;
    assignedBy?: { username: string; displayName?: string };
    author?: { username: string; displayName?: string };
    sizeMetrics?: {
      additions: number | null;
      deletions: number | null;
      filesChanged: number | null;
    };
    jobType?: 'review' | 'followup';
  }>;
} {
  return {
    active: Array.from(activeJobs.values()).map((js) => ({
      id: js.job.id,
      mrNumber: js.job.mrNumber,
      project: js.job.projectPath,
      mrUrl: js.job.mrUrl,
      status: js.status,
      startedAt: js.startedAt?.toISOString(),
      progress: js.progress,
      title: js.job.title,
      description: js.job.description,
      assignedBy: js.job.assignedBy,
      author: js.job.author,
      sizeMetrics: js.job.sizeMetrics,
      jobType: js.job.jobType || 'review',
    })),
    recent: completedJobs.map((js) => ({
      id: js.job.id,
      mrNumber: js.job.mrNumber,
      project: js.job.projectPath,
      mrUrl: js.job.mrUrl,
      status: js.status,
      startedAt: js.startedAt?.toISOString(),
      completedAt: js.completedAt?.toISOString(),
      error: js.error,
      progress: js.progress,
      title: js.job.title,
      assignedBy: js.job.assignedBy,
      author: js.job.author,
      sizeMetrics: js.job.sizeMetrics,
      jobType: js.job.jobType || 'review',
    })),
  };
}

/**
 * Update job progress
 */
export function updateJobProgress(
  jobId: string,
  progress: ReviewProgress,
  event?: ProgressEvent,
): void {
  const jobStatus = activeJobs.get(jobId);
  if (jobStatus) {
    jobStatus.progress = progress;
    // Notify listeners
    progressChangeCallback?.(jobId, progress, event);
  }
}

/**
 * Set the progress change callback
 */
export function setProgressChangeCallback(callback: ProgressChangeCallback | null): void {
  progressChangeCallback = callback;
}

/**
 * Set the state change callback (called when jobs are added/completed/failed)
 */
export function setStateChangeCallback(callback: StateChangeCallback | null): void {
  stateChangeCallback = callback;
}

/**
 * Set the persist job record callback (SPEC-176).
 * Fired in the completion finally block; the queue never awaits the returned
 * promise. Implementations must swallow their own errors.
 */
export function setPersistJobRecordCallback(callback: PersistJobRecordCallback | null): void {
  persistJobRecordCallback = callback;
}

/**
 * Seed the in-memory completed jobs list at startup (SPEC-176).
 * Records beyond MAX_COMPLETED_JOBS are dropped. Insertion order is preserved.
 */
export function replaceCompletedJobs(records: JobStatus[]): void {
  completedJobs.length = 0;
  for (const record of records.slice(0, MAX_COMPLETED_JOBS)) {
    completedJobs.push(record);
  }
}

/**
 * Get progress for a specific job
 */
export function getJobProgress(jobId: string): ReviewProgress | undefined {
  return activeJobs.get(jobId)?.progress;
}
