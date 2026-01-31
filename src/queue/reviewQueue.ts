import PQueue from 'p-queue';
import type { Logger } from 'pino';
import { loadConfig } from '../config/loader.js';
import type { ReviewProgress, ProgressEvent } from '../types/progress.js';

export interface ReviewJob {
  id: string; // Unique identifier: platform:project:mrNumber
  platform: 'gitlab' | 'github';
  projectPath: string;
  localPath: string;
  mrNumber: number;
  skill: string;
  mrUrl: string;
  sourceBranch: string;
  targetBranch: string;
  // Job type: review or followup
  jobType?: 'review' | 'followup';
  // Optional MR metadata
  title?: string;
  description?: string;
  assignedBy?: {
    username: string;
    displayName?: string;
  };
}

// Deduplication tracking
const recentJobs = new Map<string, number>(); // jobId -> timestamp

// Abort controllers for cancellation
const jobAbortControllers = new Map<string, AbortController>();

// Active and completed jobs tracking
export interface JobStatus {
  job: ReviewJob;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  progress?: ReviewProgress;
}

// Progress change callback type
export type ProgressChangeCallback = (jobId: string, progress: ReviewProgress, event?: ProgressEvent) => void;

// State change callback type - called when jobs are added/started/completed/failed
export type StateChangeCallback = () => void;

// Global progress change listener
let progressChangeCallback: ProgressChangeCallback | null = null;

// Global state change listener
let stateChangeCallback: StateChangeCallback | null = null;

const activeJobs = new Map<string, JobStatus>();
const completedJobs: JobStatus[] = []; // Keep last 20
const MAX_COMPLETED_JOBS = 20;

let queue: PQueue | null = null;
let logger: Logger | null = null;

export function initQueue(log: Logger): PQueue {
  const config = loadConfig();
  logger = log;

  queue = new PQueue({
    concurrency: config.queue.maxConcurrent,
    timeout: 30 * 60 * 1000, // 30 minutes max per job
    throwOnTimeout: true,
  });

  // Log queue events
  queue.on('active', () => {
    log.info({ pending: queue!.pending, size: queue!.size }, 'Job started');
  });

  queue.on('idle', () => {
    log.info('Queue is idle');
  });

  queue.on('error', (error) => {
    log.error({ error }, 'Queue error');
  });

  // Cleanup old deduplication entries periodically
  setInterval(() => {
    cleanupDeduplication();
  }, 60000); // Every minute

  return queue;
}

export function getQueue(): PQueue {
  if (!queue) {
    throw new Error('Queue non initialisée. Appelez initQueue() d\'abord.');
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
  processor: (job: ReviewJob, signal: AbortSignal) => Promise<void>
): Promise<boolean> {
  const q = getQueue();
  const log = logger!;

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
    'Job ajouté à la queue'
  );

  // Add to queue
  q.add(async () => {
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
      throw error;
    } finally {
      // Cleanup abort controller
      jobAbortControllers.delete(job.id);
      // Move to completed jobs
      activeJobs.delete(job.id);
      completedJobs.unshift(jobStatus);
      if (completedJobs.length > MAX_COMPLETED_JOBS) {
        completedJobs.pop();
      }

      // Notify state change (job completed/failed)
      stateChangeCallback?.();
    }
  }).catch((error) => {
    log.error({ jobId: job.id, error }, 'Job échoué');
  });

  return true;
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
    jobType?: 'review' | 'followup';
  }>;
} {
  return {
    active: Array.from(activeJobs.values()).map(js => ({
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
      jobType: js.job.jobType || 'review',
    })),
    recent: completedJobs.map(js => ({
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
      jobType: js.job.jobType || 'review',
    })),
  };
}

/**
 * Update job progress
 */
export function updateJobProgress(jobId: string, progress: ReviewProgress, event?: ProgressEvent): void {
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
 * Get progress for a specific job
 */
export function getJobProgress(jobId: string): ReviewProgress | undefined {
  return activeJobs.get(jobId)?.progress;
}
