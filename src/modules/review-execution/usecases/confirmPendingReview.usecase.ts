import type { Logger } from 'pino';
import type { ReviewJob } from '@/frameworks/queue/pQueueAdapter.js';
import type { PendingReviewRequestGateway } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.gateway.js';
import type { PendingReviewRequest } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';
import type {
  EnqueueReviewFunction,
  GateClaudeInvocationProcessor,
} from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';

export interface ConfirmQueuePort {
  hasActiveJob(jobId: string): boolean;
  getJobStatus(jobId: string): 'queued' | 'running' | 'completed' | 'failed' | null;
}

export interface ConfirmPendingReviewDependencies {
  pendingReviewRequestGateway: PendingReviewRequestGateway;
  queuePort: ConfirmQueuePort;
  enqueue: EnqueueReviewFunction;
  // The processor closes over framework-bound gateways (Claude invoker, context
  // file system, websocket broadcaster), which cannot be serialised onto disk.
  // We persist only the ReviewJob snapshot and rehydrate the processor from a
  // code-side registry at confirmation time.
  resolveProcessor: (pending: PendingReviewRequest) => GateClaudeInvocationProcessor;
  // True when the parked request's project is still configured and enabled. When
  // false the run cannot happen, so the request is refused and kept on the
  // waiting list. Platform resolution lives entirely here (config lookup).
  isProjectRunnable: (pending: PendingReviewRequest) => boolean;
  logger: Logger;
}

export type ConfirmPendingReviewResult =
  | { status: 'confirmed'; jobId: string }
  | { status: 'not-found' }
  | { status: 'already-running'; message: string }
  | { status: 'project-not-configured'; message: string };

const ALREADY_RUNNING_MESSAGE = 'Cette review est déjà en cours';
const PROJECT_NOT_CONFIGURED_MESSAGE = "Le projet associé n'est plus configuré";

export class ConfirmPendingReviewUseCase {
  constructor(private readonly deps: ConfirmPendingReviewDependencies) {}

  async execute(input: { pendingId: string }): Promise<ConfirmPendingReviewResult> {
    const { pendingReviewRequestGateway, queuePort, enqueue, resolveProcessor, isProjectRunnable, logger } =
      this.deps;

    const pending = await pendingReviewRequestGateway.load(input.pendingId);
    if (!pending) {
      return { status: 'not-found' };
    }

    if (queuePort.hasActiveJob(pending.job.id)) {
      logger.info({ pendingId: input.pendingId, jobId: pending.job.id }, 'Pending review confirm rejected: already running');
      return { status: 'already-running', message: ALREADY_RUNNING_MESSAGE };
    }

    if (!isProjectRunnable(pending)) {
      logger.warn(
        { pendingId: input.pendingId, jobId: pending.job.id, projectPath: pending.job.projectPath },
        'Pending review confirm rejected: project no longer configured',
      );
      return { status: 'project-not-configured', message: PROJECT_NOT_CONFIGURED_MESSAGE };
    }

    const processor = resolveProcessor(pending);
    const job: ReviewJob = pending.job;
    const enqueued = await enqueue(job, processor);
    if (!enqueued) {
      logger.warn({ pendingId: input.pendingId, jobId: job.id }, 'Pending review confirm refused by queue');
      return { status: 'already-running', message: ALREADY_RUNNING_MESSAGE };
    }

    await pendingReviewRequestGateway.delete(input.pendingId);
    logger.info({ pendingId: input.pendingId, jobId: job.id }, 'Pending review confirmed and enqueued');
    return { status: 'confirmed', jobId: job.id };
  }
}
