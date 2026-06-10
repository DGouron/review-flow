import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';

import { invokeClaudeReview, sendNotification } from '@/claude/invoker.js';
import { findRepositoryByProjectPath, type RepositoryConfig } from '@/config/loader.js';
import {
  loadProjectConfig,
  getProjectAgentsOrFocusDefaults,
  getFollowupAgents,
  getProjectLanguage,
} from '@/config/projectConfig.js';
import type { ClaudeInvokerDependencies } from '@/frameworks/claude/claudeInvoker.js';
import {
  enqueueReview,
  createJobId,
  updateJobProgress,
  cancelJob,
  type ReviewJob,
} from '@/frameworks/queue/pQueueAdapter.js';
import { startWatchingReviewContext, stopWatchingReviewContext } from '@/main/websocket.js';
import type { BudgetExceededPayload } from '@/main/websocket.js';
import type { ApprovalRevocationGateway } from '@/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.js';
import type { DiffMetadataFetchGateway } from '@/modules/platform-integration/entities/diffMetadata/diffMetadata.gateway.js';
import { gitLabMergeRequestEventGuard } from '@/modules/platform-integration/entities/gitlab/gitlabMergeRequestEvent.guard.js';
import { gitLabNoteEventGuard } from '@/modules/platform-integration/entities/gitlab/gitlabNoteEvent.guard.js';
import type { IdempotencyStore } from '@/modules/platform-integration/entities/idempotency/idempotencyStore.gateway.js';
import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import {
  filterGitLabEvent,
  filterGitLabMrUpdate,
  filterGitLabMrClose,
  filterGitLabMrMerge,
  filterGitLabMrApprove,
  filterGitLabNoteEvent,
} from '@/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.js';
import { defaultGitLabExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import { resolvePinnedThreadFetchTarget } from '@/modules/platform-integration/services/pinnedThreadFetchTarget.js';
import type { IsTrustedActorUseCase } from '@/modules/platform-integration/usecases/isTrustedActor.usecase.js';
import { resolveProvenance } from '@/modules/review-execution/entities/actionProvenance/actionProvenance.js';
import {
  DEFAULT_AGENTS,
  DEFAULT_FOLLOWUP_AGENTS,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type { DiffMetadata } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import { ReviewContextResultFactory } from '@/modules/review-execution/entities/reviewContext/reviewContextResult.factory.js';
import { GitLabThreadInventoryGateway } from '@/modules/review-execution/interface-adapters/gateways/threadInventory.gitlab.gateway.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';
import { dispatchConstrainedActions } from '@/modules/review-execution/services/dispatchConstrainedActions.js';
import type { ProcessorBuilder } from '@/modules/review-execution/services/processorRegistry.js';
import { defaultCommandExecutor } from '@/modules/review-execution/services/threadActionsExecutor.js';
import { parseThreadActions } from '@/modules/review-execution/services/threadActionsParser.js';
import type { GateClaudeInvocationUseCase } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import { parseReviewOutput } from '@/modules/statistics-insights/services/statsService.js';
import type { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';
import { evaluateQualityGate } from '@/modules/tracking/entities/qualityGate/qualityGate.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import type { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import type { RecordBypassUseCase } from '@/modules/tracking/usecases/tracking/recordBypass.usecase.js';
import type { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import type { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import type { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import type { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import type { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import type {
  RemoveResult,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import {
  verifyGitLabSignature,
  getGitLabEventType,
  getGitLabEventUuid,
} from '@/security/verifier.js';

export type RemoveWorktreeAction = (input: {
  identity: WorktreeIdentity;
  sourceCheckoutPath: string;
}) => Promise<RemoveResult>;

export function extractBaseUrl(remoteUrl: string): string | null {
  try {
    // Handle HTTPS URLs: https://gitlab.example.com/group/project.git
    if (remoteUrl.startsWith('http')) {
      const url = new URL(remoteUrl);
      return `${url.protocol}//${url.host}`;
    }
    // Handle SSH URLs: git@gitlab.example.com:group/project.git
    const sshMatch = remoteUrl.match(/@([^:]+):/);
    if (sshMatch) {
      return `https://${sshMatch[1]}`;
    }
  } catch {
    // Invalid URL — return null
  }
  return null;
}

export interface GitLabWebhookDependencies {
  reviewContextGateway: ReviewContextGateway;
  threadFetchGateway: ThreadFetchGateway;
  diffMetadataFetchGateway: DiffMetadataFetchGateway;
  diffStatsFetchGateway: DiffStatsFetchGateway;
  trackAssignment: TrackAssignmentUseCase;
  recordCompletion: RecordReviewCompletionUseCase;
  recordPush: RecordPushUseCase;
  transitionState: TransitionStateUseCase;
  checkFollowupNeeded: CheckFollowupNeededUseCase;
  syncThreads: SyncThreadsUseCase;
  enforceBudget: Pick<EnforceBudgetUseCase, 'execute'>;
  broadcastBudgetExceeded: (payload: BudgetExceededPayload) => void;
  getRepositories: () => RepositoryConfig[];
  claudeInvokerDeps?: ClaudeInvokerDependencies;
  gateClaudeInvocation?: GateClaudeInvocationUseCase;
  isTrustedActor?: IsTrustedActorUseCase;
  removeWorktree: RemoveWorktreeAction;
  recordBypass: RecordBypassUseCase;
  noteCommentPostGateway: NoteCommentPostGateway;
  handlePlatformApproval: HandlePlatformApprovalUseCase;
  approvalRevocationGateway: ApprovalRevocationGateway;
  idempotencyStore?: IdempotencyStore;
  getQualityThreshold: (projectPath: string) => number | null;
  now: () => string;
}

function listEnabledLocalPaths(getRepositories: () => RepositoryConfig[]): string[] {
  return getRepositories()
    .filter((repository) => repository.enabled)
    .map((repository) => repository.localPath);
}

/**
 * Trigger-actor provenance gate (SPEC-197). Resolves whether the actor that
 * triggered the webhook is a Developer+ member of the target project. When no
 * resolver is wired the gate is a no-op (returns true) so existing behaviour is
 * preserved; with a resolver present it is fail-closed (a thrown lookup -> false).
 */
async function resolveActorTrust(
  deps: GitLabWebhookDependencies,
  projectPath: string,
  username: string,
): Promise<boolean> {
  if (!deps.isTrustedActor) {
    return true;
  }
  return deps.isTrustedActor.execute({ username, projectPath });
}

async function handleGitLabNoteHook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger,
  deps: GitLabWebhookDependencies,
): Promise<void> {
  const parseResult = gitLabNoteEventGuard.safeParse(request.body);
  if (!parseResult.success) {
    logger.debug({ errors: parseResult.error }, 'Invalid GitLab note payload (ignored)');
    reply.status(200).send({ status: 'ignored', reason: 'Note payload not parseable' });
    return;
  }

  const filterResult = filterGitLabNoteEvent(parseResult.data);
  if (!filterResult.shouldProcess) {
    reply.status(200).send({ status: 'ignored', reason: filterResult.reason });
    return;
  }

  // SPEC-197 AC3: gate the note trigger on actor provenance before any side effect.
  // A non-trusted actor's note never reaches the bypass-processing path.
  const noteActorTrusted = await resolveActorTrust(
    deps,
    filterResult.projectPath,
    parseResult.data.user.username,
  );
  if (!noteActorTrusted) {
    logger.info(
      { projectPath: filterResult.projectPath, actor: parseResult.data.user.username },
      'Note trigger from non-trusted actor parked (provenance gate)',
    );
    reply.status(202).send({ status: 'pending-confirmation', reason: 'untrusted-actor' });
    return;
  }

  const repoConfig = findRepositoryByProjectPath(filterResult.projectPath);
  if (!repoConfig) {
    logger.debug(
      { projectPath: filterResult.projectPath },
      'Note for unconfigured project (ignored)',
    );
    reply.status(200).send({ status: 'ignored', reason: 'Repository not configured' });
    return;
  }

  const mrId = `gitlab-${filterResult.projectPath}-${filterResult.mergeRequestNumber}`;
  const result = deps.recordBypass.execute({
    projectPath: repoConfig.localPath,
    mrId,
    commentBody: filterResult.commentBody,
    author: filterResult.authorUsername,
    now: deps.now,
  });

  if (result.kind === 'rejected-missing-reason') {
    await deps.noteCommentPostGateway.postComment({
      projectPath: filterResult.projectPath,
      mrNumber: filterResult.mergeRequestNumber,
      body: result.message,
    });
    logger.info(
      { mrId, author: filterResult.authorUsername },
      'Bypass marker without reason rejected',
    );
    reply.status(200).send({ status: 'bypass-rejected', reason: 'missing-reason' });
    return;
  }

  if (result.kind === 'recorded') {
    logger.info(
      { mrId, author: result.bypass.author, reason: result.bypass.reason },
      'Bypass recorded on tracked MR',
    );
    reply.status(200).send({ status: 'bypass-recorded' });
    return;
  }

  if (result.kind === 'mr-not-found') {
    reply.status(200).send({ status: 'ignored', reason: 'MR not tracked' });
    return;
  }

  reply.status(200).send({ status: 'ignored', reason: 'No bypass marker' });
}

export async function handleGitLabWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger,
  trackingGateway: ReviewRequestTrackingGateway,
  deps: GitLabWebhookDependencies,
): Promise<void> {
  const {
    trackAssignment,
    recordCompletion,
    recordPush,
    transitionState,
    checkFollowupNeeded,
    syncThreads,
  } = deps;
  // 1. Verify signature
  const verification = verifyGitLabSignature(request);
  if (!verification.valid) {
    logger.warn({ error: verification.error }, 'GitLab signature verification failed');
    reply.status(401).send({ error: verification.error });
    return;
  }

  // 1a. Idempotency guard: at most once per event UUID within the TTL window.
  // Runs right after auth and before any side effect. A missing UUID degrades
  // to the normal (gated) pipeline rather than being rejected.
  if (deps.idempotencyStore) {
    const eventUuid = getGitLabEventUuid(request);
    if (eventUuid !== undefined) {
      const accepted = await deps.idempotencyStore.recordIfAbsent(eventUuid);
      if (!accepted) {
        logger.info({ eventUuid }, 'Duplicate GitLab event UUID, no-op');
        reply.status(200).send({ status: 'ignored', reason: 'Duplicate event' });
        return;
      }
    } else {
      logger.debug('GitLab event without UUID, proceeding without deduplication');
    }
  }

  // 2. Check event type
  const eventType = getGitLabEventType(request);

  if (eventType === 'Note Hook') {
    await handleGitLabNoteHook(request, reply, logger, deps);
    return;
  }

  if (eventType !== 'Merge Request Hook') {
    logger.debug({ eventType }, 'Ignoring non-MR event');
    reply.status(200).send({ status: 'ignored', reason: 'Not a MR event' });
    return;
  }

  // 3. Parse and validate event
  const parseResult = gitLabMergeRequestEventGuard.safeParse(request.body);
  if (!parseResult.success) {
    logger.warn({ errors: parseResult.error }, 'Invalid GitLab webhook payload');
    reply.status(400).send({ error: 'Invalid webhook payload' });
    return;
  }
  const event = parseResult.data;

  // 3a. Check if MR was closed - clean up tracking and cancel any running job
  const closeResult = filterGitLabMrClose(event);
  if (closeResult.shouldProcess) {
    const projectPath = closeResult.projectPath;
    const mrNumber = closeResult.mergeRequestNumber;
    const mrId = `gitlab-${projectPath}-${mrNumber}`;

    // Find repo config
    const repoConfig = findRepositoryByProjectPath(projectPath);
    if (repoConfig) {
      // Cancel any running job for this MR
      const jobId = createJobId('gitlab', projectPath, mrNumber);
      const cancelled = cancelJob(jobId);

      // Archive the MR from tracking
      const archived = trackingGateway.archive(repoConfig.localPath, mrId);

      // Delete review context file
      const contextGateway = deps.reviewContextGateway;
      const contextDeleted = contextGateway.delete(repoConfig.localPath, mrId);

      try {
        const worktreeRemoval = await deps.removeWorktree({
          identity: { platform: 'gitlab', projectPath, mrNumber },
          sourceCheckoutPath: repoConfig.localPath,
        });
        if (worktreeRemoval.status === 'failed') {
          logger.warn(
            { mrNumber, project: projectPath, warning: worktreeRemoval.warning },
            'removeWorktree failed on close',
          );
        }
      } catch (error) {
        logger.warn(
          {
            mrNumber,
            project: projectPath,
            error: error instanceof Error ? error.message : String(error),
          },
          'removeWorktree threw on close',
        );
      }

      logger.info(
        {
          mrNumber,
          project: projectPath,
          jobCancelled: cancelled,
          trackingArchived: archived,
          contextDeleted: contextDeleted.deleted,
        },
        'MR closed - cleaned up tracking and cancelled job',
      );

      reply.status(200).send({
        status: 'cleaned',
        mrNumber,
        jobCancelled: cancelled,
        trackingArchived: archived,
      });
      return;
    }

    // No repo config, just acknowledge
    logger.info({ mrNumber, project: projectPath }, 'MR closed but repo not configured');
    reply.status(200).send({ status: 'ignored', reason: 'MR closed, repo not configured' });
    return;
  }

  // 3b. Check if MR was merged - update tracking state
  const mergeResult = filterGitLabMrMerge(event);
  if (mergeResult.shouldProcess) {
    const repoConfig = findRepositoryByProjectPath(mergeResult.projectPath);
    if (repoConfig) {
      const mrId = `gitlab-${mergeResult.projectPath}-${mergeResult.mergeRequestNumber}`;
      transitionState.execute({ projectPath: repoConfig.localPath, mrId, targetState: 'merged' });

      try {
        const worktreeRemoval = await deps.removeWorktree({
          identity: {
            platform: 'gitlab',
            projectPath: mergeResult.projectPath,
            mrNumber: mergeResult.mergeRequestNumber,
          },
          sourceCheckoutPath: repoConfig.localPath,
        });
        if (worktreeRemoval.status === 'failed') {
          logger.warn(
            { mrNumber: mergeResult.mergeRequestNumber, warning: worktreeRemoval.warning },
            'removeWorktree failed on merge',
          );
        }
      } catch (error) {
        logger.warn(
          {
            mrNumber: mergeResult.mergeRequestNumber,
            error: error instanceof Error ? error.message : String(error),
          },
          'removeWorktree threw on merge',
        );
      }

      logger.info({ mrNumber: mergeResult.mergeRequestNumber }, 'MR marked as merged');
      reply.status(200).send({ status: 'merged', mrNumber: mergeResult.mergeRequestNumber });
      return;
    }
  }

  // 3c. Check if MR was approved - run gate, revoke on platform if it fails
  const approveResult = filterGitLabMrApprove(event);
  if (approveResult.shouldProcess) {
    const repoConfig = findRepositoryByProjectPath(approveResult.projectPath);
    if (repoConfig) {
      const mrId = `gitlab-${approveResult.projectPath}-${approveResult.mergeRequestNumber}`;
      const threshold = deps.getQualityThreshold(repoConfig.localPath);
      const transitionResult = transitionState.execute({
        projectPath: repoConfig.localPath,
        mrId,
        targetState: 'approved',
        qualityCheck: (mr) =>
          evaluateQualityGate({
            latestScore: mr.latestScore,
            blockingIssues: mr.openThreads,
            threshold,
          }),
      });

      if (transitionResult.ok) {
        logger.info({ mrNumber: approveResult.mergeRequestNumber }, 'MR marked as approved');
        reply.status(200).send({ status: 'approved', mrNumber: approveResult.mergeRequestNumber });
        return;
      }

      if (transitionResult.reason === 'quality-gate') {
        const verdict = deps.handlePlatformApproval.execute({
          projectPath: repoConfig.localPath,
          mrId,
          qualityThreshold: threshold,
        });

        if (verdict.kind === 'reverted') {
          try {
            await deps.approvalRevocationGateway.revoke({
              projectPath: approveResult.projectPath,
              mrNumber: approveResult.mergeRequestNumber,
            });
          } catch (error) {
            logger.warn(
              {
                mrNumber: approveResult.mergeRequestNumber,
                error: error instanceof Error ? error.message : String(error),
              },
              'Failed to revoke GitLab approval; continuing with FR comment',
            );
          }

          try {
            await deps.noteCommentPostGateway.postComment({
              projectPath: approveResult.projectPath,
              mrNumber: approveResult.mergeRequestNumber,
              body: verdict.message,
            });
          } catch (error) {
            logger.warn(
              {
                mrNumber: approveResult.mergeRequestNumber,
                error: error instanceof Error ? error.message : String(error),
              },
              'Failed to post FR explanation comment after revoking GitLab approval',
            );
          }

          logger.info(
            { mrNumber: approveResult.mergeRequestNumber, reason: verdict.reason },
            'Platform approval revoked on non-qualified MR',
          );
          reply.status(200).send({
            status: 'unapproved',
            mrNumber: approveResult.mergeRequestNumber,
            reason: verdict.reason,
          });
          return;
        }

        reply.status(200).send({
          status: 'ignored',
          mrNumber: approveResult.mergeRequestNumber,
          reason: verdict.kind,
        });
        return;
      }

      logger.info(
        { mrNumber: approveResult.mergeRequestNumber, reason: transitionResult.reason },
        'GitLab approval ignored (MR not tracked)',
      );
      reply.status(200).send({
        status: 'ignored',
        mrNumber: approveResult.mergeRequestNumber,
        reason: transitionResult.reason,
      });
      return;
    }
  }

  // 3d. Filter for review assignment
  const filterResult = filterGitLabEvent(event);

  // Debug: log reviewers data
  logger.info(
    {
      project: event.project?.path_with_namespace,
      mrIid: event.object_attributes?.iid,
      action: event.object_attributes?.action,
      reviewers: event.reviewers?.map((r) => r.username) || 'NONE',
      changesReviewers: event.changes?.reviewers ? 'YES' : 'NO',
      shouldProcess: filterResult.shouldProcess,
      reason: filterResult.reason,
    },
    'GitLab MR event received',
  );

  if (!filterResult.shouldProcess) {
    // Check if this is an MR update that might need a followup review
    const updateResult = filterGitLabMrUpdate(event);
    logger.debug(
      { updateResult, action: event.object_attributes?.action },
      'Checking for followup review',
    );

    if (updateResult.shouldProcess && updateResult.isFollowup) {
      // Find repo config to get local path
      const updateRepoConfig = findRepositoryByProjectPath(updateResult.projectPath);
      if (updateRepoConfig) {
        // Record the push event
        const mr = recordPush.execute({
          projectPath: updateRepoConfig.localPath,
          mrNumber: updateResult.mergeRequestNumber,
          platform: 'gitlab',
        });
        logger.info(
          {
            mrNumber: updateResult.mergeRequestNumber,
            mrFound: !!mr,
            mrState: mr?.state,
            lastPushAt: mr?.lastPushAt,
            lastReviewAt: mr?.lastReviewAt,
          },
          'Push event recorded',
        );

        // Check if this MR needs a followup (has open threads and was pushed since last review)
        const needsFollowup =
          mr &&
          checkFollowupNeeded.execute({
            projectPath: updateRepoConfig.localPath,
            mrNumber: updateResult.mergeRequestNumber,
            platform: 'gitlab',
          });
        logger.info({ needsFollowup, mrState: mr?.state }, 'Followup check result');

        if (needsFollowup) {
          if (mr.autoFollowup === false) {
            logger.info(
              { mrNumber: updateResult.mergeRequestNumber, project: updateResult.projectPath },
              'Auto-followup disabled for this MR, skipping',
            );
            reply.status(200).send({ status: 'ignored', reason: 'Auto-followup disabled' });
            return;
          }

          logger.info(
            { mrNumber: updateResult.mergeRequestNumber, project: updateResult.projectPath },
            'Auto-triggering followup review after push',
          );

          const projectConfig = loadProjectConfig(updateRepoConfig.localPath);
          const skill = projectConfig?.reviewFollowupSkill || 'review-followup';

          const followupJobId = createJobId(
            'gitlab-followup',
            updateResult.projectPath,
            updateResult.mergeRequestNumber,
          );
          const followupJob: ReviewJob = {
            id: followupJobId,
            platform: 'gitlab',
            projectPath: updateResult.projectPath,
            localPath: updateRepoConfig.localPath,
            mrNumber: updateResult.mergeRequestNumber,
            skill,
            mrUrl: updateResult.mergeRequestUrl,
            sourceBranch: updateResult.sourceBranch,
            targetBranch: updateResult.targetBranch,
            jobType: 'followup',
          };

          const followupBudgetDecision = await deps.enforceBudget.execute({
            localPaths: listEnabledLocalPaths(deps.getRepositories),
          });
          if (!followupBudgetDecision.accepted) {
            logger.warn(
              {
                mrNumber: followupJob.mrNumber,
                limitUsd: followupBudgetDecision.status.limitUsd,
                consumedUsd: followupBudgetDecision.status.consumedUsd,
              },
              'Budget exceeded, followup not enqueued',
            );
            deps.broadcastBudgetExceeded({
              mrNumber: followupJob.mrNumber,
              platform: 'gitlab',
              projectPath: followupJob.projectPath,
              limitUsd: followupBudgetDecision.status.limitUsd,
              consumedUsd: followupBudgetDecision.status.consumedUsd,
            });
            reply.status(200).send({ status: 'rejected', reason: 'budget-exceeded' });
            return;
          }

          const followupProcessor = async (j: ReviewJob, signal: AbortSignal): Promise<void> => {
            sendNotification(
              'Review followup démarrée',
              `MR !${j.mrNumber} - ${j.projectPath}`,
              logger,
            );

            // Create review context file with pre-fetched threads and diff metadata
            const mergeRequestId = `gitlab-${j.projectPath}-${j.mrNumber}`;
            const contextGateway = deps.reviewContextGateway;
            const threadFetchGw = deps.threadFetchGateway;
            const diffMetadataFetchGw = deps.diffMetadataFetchGateway;

            try {
              const threads = threadFetchGw.fetchThreads(j.projectPath, j.mrNumber);
              let diffMetadata: DiffMetadata | undefined;
              try {
                diffMetadata = diffMetadataFetchGw.fetchDiffMetadata(j.projectPath, j.mrNumber);
              } catch (error) {
                logger.warn(
                  {
                    mrNumber: j.mrNumber,
                    error: error instanceof Error ? error.message : String(error),
                  },
                  'Failed to fetch diff metadata for followup, inline comments will be skipped',
                );
              }
              const followupAgentsList = getFollowupAgents(j.localPath) ?? DEFAULT_FOLLOWUP_AGENTS;
              contextGateway.create({
                localPath: j.localPath,
                mergeRequestId,
                platform: 'gitlab',
                projectPath: j.projectPath,
                mergeRequestNumber: j.mrNumber,
                threads,
                agents: followupAgentsList,
                diffMetadata,
              });
              logger.info(
                {
                  mrNumber: j.mrNumber,
                  threadsCount: threads.length,
                  hasDiffMetadata: !!diffMetadata,
                },
                'Review context file created with threads for followup',
              );

              startWatchingReviewContext(j.id, j.localPath, mergeRequestId);
              logger.info(
                { mrNumber: j.mrNumber },
                'Started watching review context for live progress',
              );
            } catch (error) {
              logger.warn(
                {
                  mrNumber: j.mrNumber,
                  error: error instanceof Error ? error.message : String(error),
                },
                'Failed to create review context file for followup, continuing without it',
              );
            }

            const result = await invokeClaudeReview(
              j,
              logger,
              (progress, progressEvent) => {
                updateJobProgress(j.id, progress, progressEvent);

                // Also update the review context file for file-based progress tracking
                const runningAgent = progress.agents.find((a) => a.status === 'running');
                const completedAgents = progress.agents
                  .filter((a) => a.status === 'completed')
                  .map((a) => a.name);

                contextGateway.updateProgress(j.localPath, mergeRequestId, {
                  phase: progress.currentPhase,
                  currentStep: runningAgent?.name ?? null,
                  stepsCompleted: completedAgents,
                });
              },
              signal,
              deps.claudeInvokerDeps,
            );

            stopWatchingReviewContext(mergeRequestId);

            if (result.success) {
              // Parse review output for stats
              const parsed = parseReviewOutput(result.stdout);

              let threadResolveCount = 0;

              // PRIMARY: Execute actions from context file (agent writes actions here)
              const reviewContext = contextGateway.read(j.localPath, mergeRequestId);
              if (reviewContext && reviewContext.actions.length > 0) {
                threadResolveCount = reviewContext.actions.filter(
                  (a) => a.type === 'THREAD_RESOLVE',
                ).length;
                const followupBaseUrl = extractBaseUrl(updateRepoConfig.remoteUrl);
                const contextActionResult = await executeActionsFromContext(
                  reviewContext,
                  j.localPath,
                  logger,
                  defaultCommandExecutor,
                  followupBaseUrl,
                  deps.noteCommentPostGateway,
                );
                logger.info(
                  { ...contextActionResult, threadResolveCount, mrNumber: j.mrNumber },
                  'Actions executed from context file for followup',
                );
                contextGateway.setResult(
                  j.localPath,
                  mergeRequestId,
                  ReviewContextResultFactory.fromParsedReview(parsed),
                );
              } else {
                // FALLBACK: Execute thread actions from stdout markers (backward compatibility)
                const threadActions = parseThreadActions(result.stdout);
                if (threadActions.length > 0) {
                  threadResolveCount = threadActions.filter(
                    (a) => a.type === 'THREAD_RESOLVE',
                  ).length;
                  const actionResult = await dispatchConstrainedActions(threadActions, {
                    context: {
                      platform: 'gitlab',
                      projectPath: j.projectPath,
                      mrNumber: j.mrNumber,
                      localPath: j.localPath,
                    },
                    provenance: resolveProvenance(null),
                    inventoryGateway: new GitLabThreadInventoryGateway(defaultGitLabExecutor),
                    logger,
                    executor: defaultCommandExecutor,
                    postGateway: deps.noteCommentPostGateway,
                  });
                  logger.info(
                    { ...actionResult, threadResolveCount, mrNumber: j.mrNumber },
                    'Thread actions executed from stdout markers for followup (fallback)',
                  );
                }
              }

              // Sync threads from GitLab FIRST to get real state after followup resolves threads
              const mrId = `gitlab-${j.projectPath}-${j.mrNumber}`;
              const updatedMr = syncThreads.execute({ projectPath: j.localPath, mrId });

              let followupDiffStats = null;
              try {
                followupDiffStats = deps.diffStatsFetchGateway.fetchDiffStats(
                  j.projectPath,
                  j.mrNumber,
                );
              } catch {
                logger.warn({ mrNumber: j.mrNumber }, 'Failed to fetch diff stats for followup');
              }

              recordCompletion.execute({
                projectPath: j.localPath,
                mrId,
                reviewData: {
                  type: 'followup',
                  durationMs: result.durationMs,
                  score: parsed.score,
                  blocking: parsed.blocking,
                  warnings: parsed.warnings,
                  suggestions: parsed.suggestions,
                  threadsOpened: 0,
                  threadsClosed: threadResolveCount,
                  diffStats: followupDiffStats,
                },
                qualityThreshold: loadProjectConfig(j.localPath)?.qualityThreshold ?? null,
              });
              logger.info(
                {
                  mrNumber: j.mrNumber,
                  score: parsed.score,
                  blocking: parsed.blocking,
                  warnings: parsed.warnings,
                  suggestions: parsed.suggestions,
                  durationMs: result.durationMs,
                  openThreads: updatedMr?.openThreads,
                  state: updatedMr?.state,
                },
                'Followup stats recorded and threads synced',
              );

              sendNotification(
                'Review followup terminée',
                `MR !${j.mrNumber} - ${j.projectPath}`,
                logger,
              );
            } else if (!result.cancelled) {
              sendNotification(
                'Review followup échouée',
                `MR !${j.mrNumber} - Code ${result.exitCode}`,
                logger,
              );
              throw new Error(
                result.stderr?.trim() || `Followup review failed with exit code ${result.exitCode}`,
              );
            }
          };

          // SPEC-197 AC2: gate the followup trigger on actor provenance.
          const followupActorTrusted = await resolveActorTrust(
            deps,
            updateResult.projectPath,
            event.user.username,
          );

          if (deps.gateClaudeInvocation) {
            const gateResult = await deps.gateClaudeInvocation.execute({
              job: followupJob,
              triggerSource: 'webhook-followup',
              processor: followupProcessor,
              actorTrusted: followupActorTrusted,
            });
            if (gateResult.status === 'pending') {
              reply.status(202).send({
                status: 'pending-confirmation',
                pendingId: gateResult.pendingId,
                mrNumber: updateResult.mergeRequestNumber,
              });
              return;
            }
          } else if (followupActorTrusted) {
            enqueueReview(followupJob, followupProcessor);
          } else {
            logger.info(
              { mrNumber: updateResult.mergeRequestNumber, actor: event.user.username },
              'Followup trigger from non-trusted actor parked (provenance gate)',
            );
            reply.status(202).send({
              status: 'pending-confirmation',
              reason: 'untrusted-actor',
              mrNumber: updateResult.mergeRequestNumber,
            });
            return;
          }

          reply.status(202).send({
            status: 'followup-queued',
            jobId: followupJobId,
            mrNumber: updateResult.mergeRequestNumber,
          });
          return;
        }
      }
    }

    reply.status(200).send({ status: 'ignored', reason: filterResult.reason });
    return;
  }

  // 4. Find repository configuration
  const repoConfig = findRepositoryByProjectPath(filterResult.projectPath);
  if (!repoConfig) {
    logger.warn({ projectPath: filterResult.projectPath }, 'Projet non configuré');
    reply.status(200).send({
      status: 'ignored',
      reason: 'Repository not configured',
    });
    return;
  }

  // 5. Track MR assignment with user info
  // Use MR assignee (actual owner), not webhook trigger (who added the reviewer)
  const mrTitle = event.object_attributes?.title || `MR !${filterResult.mergeRequestNumber}`;
  const mrAssignee = event.assignees?.[0];
  const assignedBy = {
    username: mrAssignee?.username || event.user?.username || 'unknown',
    displayName: mrAssignee?.name || event.user?.name,
  };
  // Best-effort author from the GitLab webhook (event.user is the actor that opened/updated the MR).
  // The GitLab webhook does not expose diff size stats, so sizeMetrics stays undefined here.
  const author = event.user?.username
    ? { username: event.user.username, displayName: event.user.name }
    : undefined;

  trackAssignment.execute({
    projectPath: repoConfig.localPath,
    mrInfo: {
      mrNumber: filterResult.mergeRequestNumber,
      title: mrTitle,
      url: filterResult.mergeRequestUrl,
      project: filterResult.projectPath,
      platform: 'gitlab',
      sourceBranch: filterResult.sourceBranch,
      targetBranch: filterResult.targetBranch,
    },
    assignedBy,
  });

  logger.info(
    { mrNumber: filterResult.mergeRequestNumber, assignedBy: assignedBy.username },
    'MR tracked for review',
  );

  // 6. Create and enqueue job
  const jobId = createJobId('gitlab', filterResult.projectPath, filterResult.mergeRequestNumber);
  const job: ReviewJob = {
    id: jobId,
    platform: 'gitlab',
    projectPath: filterResult.projectPath,
    localPath: repoConfig.localPath,
    mrNumber: filterResult.mergeRequestNumber,
    skill: repoConfig.skill,
    mrUrl: filterResult.mergeRequestUrl,
    sourceBranch: filterResult.sourceBranch,
    targetBranch: filterResult.targetBranch,
    jobType: 'review',
    language: getProjectLanguage(repoConfig.localPath),
    // MR metadata for dashboard
    title: mrTitle,
    description: event.object_attributes?.description,
    assignedBy,
    author,
  };

  const budgetDecision = await deps.enforceBudget.execute({
    localPaths: listEnabledLocalPaths(deps.getRepositories),
  });
  if (!budgetDecision.accepted) {
    logger.warn(
      {
        mrNumber: job.mrNumber,
        limitUsd: budgetDecision.status.limitUsd,
        consumedUsd: budgetDecision.status.consumedUsd,
      },
      'Budget exceeded, review not enqueued',
    );
    deps.broadcastBudgetExceeded({
      mrNumber: job.mrNumber,
      platform: 'gitlab',
      projectPath: job.projectPath,
      limitUsd: budgetDecision.status.limitUsd,
      consumedUsd: budgetDecision.status.consumedUsd,
    });
    reply.status(200).send({ status: 'rejected', reason: 'budget-exceeded' });
    return;
  }

  const reviewProcessor = buildGitLabReviewProcessor(deps, logger)(job);

  // SPEC-197 AC1: gate the reviewer-added trigger on actor provenance.
  const reviewerActorTrusted = await resolveActorTrust(
    deps,
    filterResult.projectPath,
    event.user.username,
  );

  if (deps.gateClaudeInvocation) {
    const gateResult = await deps.gateClaudeInvocation.execute({
      job,
      triggerSource: 'webhook-initial',
      processor: reviewProcessor,
      actorTrusted: reviewerActorTrusted,
    });
    if (gateResult.status === 'pending') {
      reply.status(202).send({
        status: 'pending-confirmation',
        pendingId: gateResult.pendingId,
        mrNumber: filterResult.mergeRequestNumber,
      });
      return;
    }
    if (gateResult.status === 'enqueued') {
      reply.status(202).send({
        status: 'queued',
        jobId,
        mrNumber: filterResult.mergeRequestNumber,
      });
      return;
    }
    reply.status(200).send({
      status: 'deduplicated',
      jobId,
      reason: 'Review already in progress or recently completed',
    });
    return;
  }

  if (!reviewerActorTrusted) {
    logger.info(
      { mrNumber: filterResult.mergeRequestNumber, actor: event.user.username },
      'Reviewer-added trigger from non-trusted actor parked (provenance gate)',
    );
    reply.status(202).send({
      status: 'pending-confirmation',
      reason: 'untrusted-actor',
      mrNumber: filterResult.mergeRequestNumber,
    });
    return;
  }

  const enqueued = await enqueueReview(job, reviewProcessor);

  if (enqueued) {
    reply.status(202).send({
      status: 'queued',
      jobId,
      mrNumber: filterResult.mergeRequestNumber,
    });
  } else {
    reply.status(200).send({
      status: 'deduplicated',
      jobId,
      reason: 'Review already in progress or recently completed',
    });
  }
}

type GitLabReviewProcessorDeps = Pick<
  GitLabWebhookDependencies,
  | 'reviewContextGateway'
  | 'threadFetchGateway'
  | 'diffMetadataFetchGateway'
  | 'diffStatsFetchGateway'
  | 'recordCompletion'
  | 'claudeInvokerDeps'
  | 'noteCommentPostGateway'
>;

export function buildGitLabReviewProcessor(
  deps: GitLabReviewProcessorDeps,
  logger: Logger,
): ProcessorBuilder {
  return (_job: ReviewJob) =>
    async (j: ReviewJob, signal: AbortSignal): Promise<void> => {
      const repoConfig = findRepositoryByProjectPath(j.projectPath);
      if (!repoConfig) {
        throw new Error(`No GitLab repository configured for projectPath "${j.projectPath}"`);
      }
      // Send start notification
      sendNotification('Review démarrée', `MR !${j.mrNumber} - ${j.projectPath}`, logger);

      // Create review context file with pre-fetched threads and diff metadata
      const mergeRequestId = `gitlab-${j.projectPath}-${j.mrNumber}`;
      const contextGateway = deps.reviewContextGateway;
      const threadFetchGw = deps.threadFetchGateway;
      const diffMetadataFetchGw = deps.diffMetadataFetchGateway;

      const pinnedTarget = resolvePinnedThreadFetchTarget({
        payloadProjectPath: j.projectPath,
        payloadMrNumber: j.mrNumber,
        findRepository: (projectPath) => {
          const matched = findRepositoryByProjectPath(projectPath);
          return matched ? { projectPath } : null;
        },
        gatedMrNumber: j.mrNumber,
      });

      try {
        const threads = pinnedTarget
          ? threadFetchGw.fetchThreads(pinnedTarget.projectPath, pinnedTarget.mrNumber)
          : [];
        if (!pinnedTarget) {
          logger.warn(
            { projectPath: j.projectPath, mrNumber: j.mrNumber },
            'Thread-fetch target failed provenance pin; action surface is empty',
          );
        }
        let diffMetadata: DiffMetadata | undefined;
        try {
          diffMetadata = diffMetadataFetchGw.fetchDiffMetadata(j.projectPath, j.mrNumber);
        } catch (error) {
          logger.warn(
            { mrNumber: j.mrNumber, error: error instanceof Error ? error.message : String(error) },
            'Failed to fetch diff metadata, inline comments will be skipped',
          );
        }
        const reviewAgentsList = getProjectAgentsOrFocusDefaults(j.localPath) ?? DEFAULT_AGENTS;
        contextGateway.create({
          localPath: j.localPath,
          mergeRequestId,
          platform: 'gitlab',
          projectPath: j.projectPath,
          mergeRequestNumber: j.mrNumber,
          threads,
          agents: reviewAgentsList,
          diffMetadata,
        });
        logger.info(
          { mrNumber: j.mrNumber, threadsCount: threads.length, hasDiffMetadata: !!diffMetadata },
          'Review context file created with threads',
        );

        startWatchingReviewContext(j.id, j.localPath, mergeRequestId);
        logger.info({ mrNumber: j.mrNumber }, 'Started watching review context for live progress');
      } catch (error) {
        logger.warn(
          { mrNumber: j.mrNumber, error: error instanceof Error ? error.message : String(error) },
          'Failed to create review context file, continuing without it',
        );
      }

      // Invoke Claude with progress tracking and cancellation support
      const result = await invokeClaudeReview(
        j,
        logger,
        (progress, progressEvent) => {
          updateJobProgress(j.id, progress, progressEvent);

          // Also update the review context file for file-based progress tracking
          const runningAgent = progress.agents.find((a) => a.status === 'running');
          const completedAgents = progress.agents
            .filter((a) => a.status === 'completed')
            .map((a) => a.name);

          contextGateway.updateProgress(j.localPath, mergeRequestId, {
            phase: progress.currentPhase,
            currentStep: runningAgent?.name ?? null,
            stepsCompleted: completedAgents,
          });
        },
        signal,
        deps.claudeInvokerDeps,
      );

      // Stop watching context file (auto-stops on completion, but explicit stop for error cases)
      stopWatchingReviewContext(mergeRequestId);

      // Send completion notification and record stats
      if (result.cancelled) {
        sendNotification('Review annulée', `MR !${j.mrNumber} - ${j.projectPath}`, logger);
      } else if (result.success) {
        // Parse review output for stats
        const parsed = parseReviewOutput(result.stdout);

        // PRIMARY: Execute actions from context file (agent writes actions here)
        const reviewContext = contextGateway.read(j.localPath, mergeRequestId);
        if (reviewContext && reviewContext.actions.length > 0) {
          const reviewBaseUrl = extractBaseUrl(repoConfig.remoteUrl);
          const contextActionResult = await executeActionsFromContext(
            reviewContext,
            j.localPath,
            logger,
            defaultCommandExecutor,
            reviewBaseUrl,
            deps.noteCommentPostGateway,
          );
          logger.info(
            { ...contextActionResult, mrNumber: j.mrNumber },
            'Actions executed from context file',
          );
          contextGateway.setResult(
            j.localPath,
            mergeRequestId,
            ReviewContextResultFactory.fromParsedReview(parsed),
          );
        } else {
          // FALLBACK: Execute thread actions from stdout markers (backward compatibility)
          const threadActions = parseThreadActions(result.stdout);
          if (threadActions.length > 0) {
            const actionResult = await dispatchConstrainedActions(threadActions, {
              context: {
                platform: 'gitlab',
                projectPath: j.projectPath,
                mrNumber: j.mrNumber,
                localPath: j.localPath,
              },
              provenance: resolveProvenance(null),
              inventoryGateway: new GitLabThreadInventoryGateway(defaultGitLabExecutor),
              logger,
              executor: defaultCommandExecutor,
              postGateway: deps.noteCommentPostGateway,
            });
            logger.info(
              { ...actionResult, mrNumber: j.mrNumber },
              'Thread actions executed from stdout markers (fallback)',
            );
          }
        }

        let reviewDiffStats = null;
        try {
          reviewDiffStats = deps.diffStatsFetchGateway.fetchDiffStats(j.projectPath, j.mrNumber);
        } catch {
          logger.warn({ mrNumber: j.mrNumber }, 'Failed to fetch diff stats for review');
        }

        deps.recordCompletion.execute({
          projectPath: j.localPath,
          mrId: `gitlab-${j.projectPath}-${j.mrNumber}`,
          reviewData: {
            type: 'review',
            durationMs: result.durationMs,
            score: parsed.score,
            blocking: parsed.blocking,
            warnings: parsed.warnings,
            suggestions: parsed.suggestions,
            threadsOpened: parsed.blocking,
            diffStats: reviewDiffStats,
          },
          qualityThreshold: loadProjectConfig(j.localPath)?.qualityThreshold ?? null,
        });

        logger.info(
          {
            mrNumber: j.mrNumber,
            score: parsed.score,
            blocking: parsed.blocking,
            warnings: parsed.warnings,
            suggestions: parsed.suggestions,
            durationMs: result.durationMs,
          },
          'Review stats recorded',
        );

        sendNotification('Review terminée', `MR !${j.mrNumber} - ${j.projectPath}`, logger);
      } else {
        sendNotification('Review échouée', `MR !${j.mrNumber} - Code ${result.exitCode}`, logger);
        throw new Error(result.stderr?.trim() || `Review failed with exit code ${result.exitCode}`);
      }
    };
}
