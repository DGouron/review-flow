import type { Logger } from 'pino';

import type { IsTrustedActorUseCase } from '@/modules/platform-integration/usecases/isTrustedActor.usecase.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type { TriggerSource } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';
import type {
  EnqueueReviewFunction,
  GateClaudeInvocationProcessor,
  GateClaudeInvocationUseCase,
} from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import type { BudgetStatus } from '@/modules/token-accounting/entities/budget/budgetStatus.js';
import type { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';

export type ReviewRequestVerdict =
  | { type: 'budget-exceeded'; status: BudgetStatus }
  | { type: 'pending'; pendingId: string | null; reason?: 'untrusted-actor' }
  | { type: 'queued'; jobId: string }
  | { type: 'deduplicated'; jobId: string };

export interface ProcessReviewRequestInput {
  job: ReviewJob;
  processor: GateClaudeInvocationProcessor;
  triggerSource: TriggerSource;
  localPaths: string[];
  actorUsername: string;
  projectPath: string;
  gateActorTrust: boolean;
}

export interface ProcessReviewRequestDependencies {
  enforceBudget: Pick<EnforceBudgetUseCase, 'execute'>;
  gateClaudeInvocation?: Pick<GateClaudeInvocationUseCase, 'execute'>;
  isTrustedActor?: Pick<IsTrustedActorUseCase, 'execute'>;
  enqueue: EnqueueReviewFunction;
  logger: Logger;
}

async function resolveActorTrust(
  input: ProcessReviewRequestInput,
  deps: ProcessReviewRequestDependencies,
): Promise<boolean> {
  if (!input.gateActorTrust || !deps.isTrustedActor) {
    return true;
  }
  return deps.isTrustedActor.execute({
    username: input.actorUsername,
    projectPath: input.projectPath,
  });
}

async function gateAndClassify(
  gateClaudeInvocation: Pick<GateClaudeInvocationUseCase, 'execute'>,
  input: ProcessReviewRequestInput,
  actorTrusted: boolean,
): Promise<ReviewRequestVerdict> {
  const gateResult = await gateClaudeInvocation.execute({
    job: input.job,
    triggerSource: input.triggerSource,
    processor: input.processor,
    actorTrusted,
  });
  if (gateResult.status === 'pending') {
    return { type: 'pending', pendingId: gateResult.pendingId };
  }
  if (gateResult.status === 'enqueued') {
    return { type: 'queued', jobId: gateResult.jobId };
  }
  return { type: 'deduplicated', jobId: input.job.id };
}

async function rawEnqueueAndClassify(
  input: ProcessReviewRequestInput,
  deps: ProcessReviewRequestDependencies,
  actorTrusted: boolean,
): Promise<ReviewRequestVerdict> {
  if (!actorTrusted) {
    return { type: 'pending', pendingId: null, reason: 'untrusted-actor' };
  }
  const enqueued = await deps.enqueue(input.job, input.processor);
  return enqueued
    ? { type: 'queued', jobId: input.job.id }
    : { type: 'deduplicated', jobId: input.job.id };
}

export async function processReviewRequest(
  input: ProcessReviewRequestInput,
  deps: ProcessReviewRequestDependencies,
): Promise<ReviewRequestVerdict> {
  const budgetDecision = await deps.enforceBudget.execute({ localPaths: input.localPaths });
  if (!budgetDecision.accepted) {
    return { type: 'budget-exceeded', status: budgetDecision.status };
  }

  const actorTrusted = await resolveActorTrust(input, deps);

  if (deps.gateClaudeInvocation) {
    return gateAndClassify(deps.gateClaudeInvocation, input, actorTrusted);
  }
  return rawEnqueueAndClassify(input, deps, actorTrusted);
}
