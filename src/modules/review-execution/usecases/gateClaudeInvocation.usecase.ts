import type { Logger } from 'pino';

import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type { PendingReviewRequestGateway } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.gateway.js';
import type {
  PendingReviewRequest,
  TriggerSource,
} from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';
import type { TriggerMode } from '@/modules/shared-kernel/entities/triggerMode/triggerMode.schema.js';
import { sanitizeJobId } from '@/shared/services/mcpJobContext.js';

export type { TriggerMode };

export type GateClaudeInvocationProcessor = (job: ReviewJob, signal: AbortSignal) => Promise<void>;

export type EnqueueReviewFunction = (
  job: ReviewJob,
  processor: GateClaudeInvocationProcessor,
) => Promise<boolean>;

export interface GateClaudeInvocationDependencies {
  getTriggerMode: () => TriggerMode;
  pendingReviewRequestGateway: PendingReviewRequestGateway;
  enqueue: EnqueueReviewFunction;
  broadcastPendingChanged: (pending: PendingReviewRequest) => void;
  logger: Logger;
  clock?: () => Date;
}

export interface GateClaudeInvocationInput {
  job: ReviewJob;
  triggerSource: TriggerSource;
  processor: GateClaudeInvocationProcessor;
  /**
   * Trigger-actor provenance verdict (SPEC-197). When explicitly `false` the job
   * is parked pending regardless of triggerMode: a non-trusted actor never
   * auto-runs. `undefined`/`true` preserves the existing triggerMode behaviour.
   */
  actorTrusted?: boolean;
}

export type GateClaudeInvocationResult =
  | { status: 'enqueued'; jobId: string }
  | { status: 'pending'; pendingId: string }
  | { status: 'rejected'; reason: string };

function buildPendingId(jobId: string): string {
  return `pending-${sanitizeJobId(jobId)}`;
}

export class GateClaudeInvocationUseCase {
  constructor(private readonly deps: GateClaudeInvocationDependencies) {}

  async execute(input: GateClaudeInvocationInput): Promise<GateClaudeInvocationResult> {
    const {
      getTriggerMode,
      pendingReviewRequestGateway,
      enqueue,
      broadcastPendingChanged,
      logger,
    } = this.deps;

    const triggerMode = getTriggerMode();
    const actorParks = input.actorTrusted === false;

    if (triggerMode === 'full-auto' && !actorParks) {
      const enqueued = await enqueue(input.job, input.processor);
      if (!enqueued) {
        logger.info(
          { jobId: input.job.id },
          'Job rejected by queue (deduplicated or already active)',
        );
        return {
          status: 'rejected',
          reason: 'Queue refused the job (deduplicated or already active)',
        };
      }
      return { status: 'enqueued', jobId: input.job.id };
    }

    const pendingId = buildPendingId(input.job.id);
    const createdAt = (this.deps.clock ?? (() => new Date()))().toISOString();
    const pending: PendingReviewRequest = {
      pendingReviewRequestId: pendingId,
      job: input.job,
      jobType: input.job.jobType ?? 'review',
      platform: input.job.platform,
      triggerSource: input.triggerSource,
      createdAt,
    };

    await pendingReviewRequestGateway.save(pending);
    broadcastPendingChanged(pending);
    logger.info(
      { pendingId, jobId: input.job.id, triggerSource: input.triggerSource },
      'Review parked for human confirmation (semi-auto trigger mode)',
    );

    return { status: 'pending', pendingId };
  }
}
