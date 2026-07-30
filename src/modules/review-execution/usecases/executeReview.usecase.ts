import type { Logger } from 'pino';

import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type { AgentDefinition } from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import type {
  ProgressEvent,
  ReviewProgress,
} from '@/modules/review-execution/entities/progress/progress.type.js';
import type { ProgressWatcher } from '@/modules/review-execution/entities/progress/progressWatcher.gateway.js';
import type { ClaudeReviewInvoker } from '@/modules/review-execution/entities/review/claudeReviewInvoker.gateway.js';
import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type {
  DiffMetadata,
  ReviewContext,
  ReviewContextThread,
} from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import { ReviewContextResultFactory } from '@/modules/review-execution/entities/reviewContext/reviewContextResult.factory.js';
import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import { parseReviewOutput } from '@/modules/statistics-insights/entities/stats/reviewOutput.parser.js';
import type { Platform } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import type { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import type { ExecutionResult } from '@/shared/foundation/executionGateway.base.js';

export interface ResolveThreadsInput {
  job: ReviewJob;
  platform: Platform;
  isFollowup: boolean;
}

export interface ActionExecutionOutcome {
  result: ExecutionResult;
  threadsClosed: number;
}

export interface ExecuteContextActionsInput {
  context: ReviewContext;
  localPath: string;
  baseUrl: string | null;
}

export interface ExecuteFallbackActionsInput {
  stdout: string;
  job: ReviewJob;
  platform: Platform;
  baseUrl: string | null;
}

export interface ReviewStatsSummary {
  score: number | null;
  blocking: number;
  warnings: number;
  suggestions: number;
  threadsOpened: number;
  threadsClosed: number;
  durationMs: number;
}

export type ExecuteReviewResult =
  | { status: 'completed'; stats: ReviewStatsSummary }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

export interface ExecuteReviewInput {
  job: ReviewJob;
  signal: AbortSignal;
  platform: Platform;
  isFollowup: boolean;
  agents: AgentDefinition[];
  baseUrl: string | null;
  notificationPrefix: 'MR !' | 'PR #';
  qualityThreshold: number | null;
}

export interface ExecuteReviewDependencies {
  reviewContextGateway: ReviewContextGateway;
  diffStatsFetchGateway: DiffStatsFetchGateway;
  recordCompletion: Pick<RecordReviewCompletionUseCase, 'execute'>;
  syncThreads: Pick<SyncThreadsUseCase, 'execute'>;
  claudeInvoker: ClaudeReviewInvoker;
  progressWatcher: ProgressWatcher;
  updateJobProgress: (jobId: string, progress: ReviewProgress, event?: ProgressEvent) => void;
  sendNotification: (title: string, message: string) => void;
  resolveThreads: (input: ResolveThreadsInput) => ReviewContextThread[];
  executeContextActions: (input: ExecuteContextActionsInput) => Promise<ActionExecutionOutcome>;
  executeFallbackActions: (input: ExecuteFallbackActionsInput) => Promise<ActionExecutionOutcome>;
  fetchDiffMetadata: (projectPath: string, mergeRequestNumber: number) => DiffMetadata;
  logger: Logger;
}

type ReviewProgressReporter = (progress: ReviewProgress, event?: ProgressEvent) => void;

function buildMergeRequestId(platform: Platform, projectPath: string, mrNumber: number): string {
  return `${platform}-${projectPath}-${mrNumber}`;
}

function createReviewContext(
  input: ExecuteReviewInput,
  deps: ExecuteReviewDependencies,
  mergeRequestId: string,
): void {
  const { job, platform } = input;
  try {
    const threads = deps.resolveThreads({ job, platform, isFollowup: input.isFollowup });

    let diffMetadata: DiffMetadata | undefined;
    try {
      diffMetadata = deps.fetchDiffMetadata(job.projectPath, job.mrNumber);
    } catch (error) {
      deps.logger.warn(
        { mrNumber: job.mrNumber, error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch diff metadata, inline comments will be skipped',
      );
    }

    deps.reviewContextGateway.create({
      localPath: job.localPath,
      mergeRequestId,
      platform,
      projectPath: job.projectPath,
      mergeRequestNumber: job.mrNumber,
      threads,
      agents: input.agents,
      diffMetadata,
    });

    deps.progressWatcher.start(job.id, job.localPath, mergeRequestId);
  } catch (error) {
    deps.logger.warn(
      { mrNumber: job.mrNumber, error: error instanceof Error ? error.message : String(error) },
      'Failed to create review context file, continuing without it',
    );
  }
}

function buildProgressReporter(
  deps: ExecuteReviewDependencies,
  job: ReviewJob,
  mergeRequestId: string,
): ReviewProgressReporter {
  return (progress, event) => {
    deps.updateJobProgress(job.id, progress, event);

    const runningAgent = progress.agents.find((agent) => agent.status === 'running');
    const completedAgents = progress.agents
      .filter((agent) => agent.status === 'completed')
      .map((agent) => agent.name);

    deps.reviewContextGateway.updateProgress(job.localPath, mergeRequestId, {
      phase: progress.currentPhase,
      currentStep: runningAgent?.name ?? null,
      stepsCompleted: completedAgents,
    });
  };
}

/**
 * Claude reaches the platform only by appending actions to the review context file
 * (the MCP `add_action` tool); the prompt forbids stdout markers. An unreadable context
 * therefore means every action Claude asked for is already lost — no thread resolved,
 * no reply, no report. That is a failed review, not a case for the marker fallback,
 * which would report success while publishing nothing.
 */
const CONTEXT_UNREADABLE_REASON =
  'review context is unreadable after the run: every requested action was lost';

async function executePostReviewActions(
  input: ExecuteReviewInput,
  deps: ExecuteReviewDependencies,
  mergeRequestId: string,
  stdout: string,
): Promise<number | null> {
  const { job, platform } = input;
  const context = deps.reviewContextGateway.read(job.localPath, mergeRequestId);

  if (!context) {
    deps.logger.error(
      {
        mrNumber: job.mrNumber,
        localPath: job.localPath,
        contextFilePath: deps.reviewContextGateway.getFilePath(job.localPath, mergeRequestId),
      },
      CONTEXT_UNREADABLE_REASON,
    );
    return null;
  }

  if (context.actions.length > 0) {
    const outcome = await deps.executeContextActions({
      context,
      localPath: job.localPath,
      baseUrl: input.baseUrl,
    });
    deps.logger.info(
      { ...outcome.result, mrNumber: job.mrNumber },
      'Actions executed from context file',
    );
    return outcome.threadsClosed;
  }

  const outcome = await deps.executeFallbackActions({
    stdout,
    job,
    platform,
    baseUrl: input.baseUrl,
  });
  if (outcome.result.total > 0) {
    deps.logger.info(
      { ...outcome.result, mrNumber: job.mrNumber },
      'Thread actions executed from stdout markers (fallback)',
    );
  }
  return outcome.threadsClosed;
}

function fetchDiffStatsBestEffort(
  gateway: DiffStatsFetchGateway,
  job: ReviewJob,
  logger: Logger,
): DiffStats | null {
  try {
    return gateway.fetchDiffStats(job.projectPath, job.mrNumber);
  } catch {
    logger.warn({ mrNumber: job.mrNumber }, 'Failed to fetch diff stats for review');
    return null;
  }
}

export type ExecuteReview = (input: ExecuteReviewInput) => Promise<ExecuteReviewResult>;

export async function executeReview(
  input: ExecuteReviewInput,
  deps: ExecuteReviewDependencies,
): Promise<ExecuteReviewResult> {
  const { job, platform, isFollowup, notificationPrefix } = input;
  const followupSuffix = isFollowup ? 'followup ' : '';
  const messageTarget = `${notificationPrefix}${job.mrNumber} - ${job.projectPath}`;

  deps.sendNotification(`Review ${followupSuffix}démarrée`, messageTarget);

  const mergeRequestId = buildMergeRequestId(platform, job.projectPath, job.mrNumber);
  createReviewContext(input, deps, mergeRequestId);

  const onProgress = buildProgressReporter(deps, job, mergeRequestId);
  const result = await deps.claudeInvoker.invoke(job, onProgress, input.signal);

  deps.progressWatcher.stop(mergeRequestId);

  if (result.cancelled) {
    deps.sendNotification(`Review ${followupSuffix}annulée`, messageTarget);
    return { status: 'cancelled' };
  }

  if (!result.success) {
    deps.sendNotification(
      `Review ${followupSuffix}échouée`,
      `${notificationPrefix}${job.mrNumber} - Code ${result.exitCode}`,
    );
    const reason = result.stderr.trim() || `Review failed with exit code ${result.exitCode}`;
    return { status: 'failed', reason };
  }

  const parsed = parseReviewOutput(result.stdout);
  const threadsClosed = await executePostReviewActions(input, deps, mergeRequestId, result.stdout);

  if (threadsClosed === null) {
    deps.sendNotification(`Review ${followupSuffix}échouée`, messageTarget);
    return { status: 'failed', reason: CONTEXT_UNREADABLE_REASON };
  }

  deps.reviewContextGateway.setResult(
    job.localPath,
    mergeRequestId,
    ReviewContextResultFactory.fromParsedReview(parsed),
  );

  if (isFollowup) {
    deps.syncThreads.execute({ projectPath: job.localPath, mrId: mergeRequestId });
  }

  const diffStats = fetchDiffStatsBestEffort(deps.diffStatsFetchGateway, job, deps.logger);
  const threadsOpened = isFollowup ? 0 : parsed.blocking;

  deps.recordCompletion.execute({
    projectPath: job.localPath,
    mrId: mergeRequestId,
    reviewData: {
      type: isFollowup ? 'followup' : 'review',
      durationMs: result.durationMs,
      score: parsed.score,
      blocking: parsed.blocking,
      warnings: parsed.warnings,
      suggestions: parsed.suggestions,
      threadsOpened,
      threadsClosed,
      diffStats,
    },
    qualityThreshold: input.qualityThreshold,
  });

  deps.sendNotification(`Review ${followupSuffix}terminée`, messageTarget);

  return {
    status: 'completed',
    stats: {
      score: parsed.score,
      blocking: parsed.blocking,
      warnings: parsed.warnings,
      suggestions: parsed.suggestions,
      threadsOpened,
      threadsClosed,
      durationMs: result.durationMs,
    },
  };
}
