import PQueue from 'p-queue';
import type { Logger } from 'pino';
import { loadConfig } from '../config/loader.js';

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
}

// Deduplication tracking
const recentJobs = new Map<string, number>(); // jobId -> timestamp

// Active and completed jobs tracking
export interface JobStatus {
  job: ReviewJob;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

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
 * Create a unique job ID
 */
export function createJobId(platform: string, projectPath: string, mrNumber: number): string {
  return `${platform}:${projectPath}:${mrNumber}`;
}

/**
 * Add a review job to the queue
 */
export async function enqueueReview(
  job: ReviewJob,
  processor: (job: ReviewJob) => Promise<void>
): Promise<boolean> {
  const q = getQueue();
  const log = logger!;

  // Check deduplication
  if (shouldDeduplicate(job.id)) {
    log.info({ jobId: job.id }, 'Job dédupliqué, ignoré');
    return false;
  }

  // Mark as processing immediately to prevent race conditions
  markJobProcessed(job.id);

  // Track job status
  const jobStatus: JobStatus = {
    job,
    status: 'queued',
  };
  activeJobs.set(job.id, jobStatus);

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
    try {
      await processor(job);
      jobStatus.status = 'completed';
      jobStatus.completedAt = new Date();
      log.info({ jobId: job.id }, 'Traitement terminé avec succès');
    } catch (error) {
      jobStatus.status = 'failed';
      jobStatus.completedAt = new Date();
      jobStatus.error = error instanceof Error ? error.message : String(error);
      log.error({ jobId: job.id, error }, 'Erreur pendant le traitement');
      throw error;
    } finally {
      // Move to completed jobs
      activeJobs.delete(job.id);
      completedJobs.unshift(jobStatus);
      if (completedJobs.length > MAX_COMPLETED_JOBS) {
        completedJobs.pop();
      }
    }
  }).catch((error) => {
    log.error({ jobId: job.id, error }, 'Job échoué');
  });

  return true;
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
    })),
  };
}
