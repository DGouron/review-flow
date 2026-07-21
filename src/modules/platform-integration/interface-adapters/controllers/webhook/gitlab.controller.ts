import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';

import { findRepositoryByProjectPath, type RepositoryConfig } from '@/config/loader.js';
import {
  loadProjectConfig,
  getFollowupAgents,
  getProjectLanguage,
} from '@/config/projectConfig.js';
import type { ClaudeInvokerDependencies } from '@/frameworks/claude/claudeInvoker.js';
import { enqueueReview, createJobId } from '@/frameworks/queue/pQueueAdapter.js';
import type { BudgetExceededPayload } from '@/main/websocket.js';
import type { ApprovalRevocationGateway } from '@/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.js';
import type { DiffMetadataFetchGateway } from '@/modules/platform-integration/entities/diffMetadata/diffMetadata.gateway.js';
import { gitLabMergeRequestEventGuard } from '@/modules/platform-integration/entities/gitlab/gitlabMergeRequestEvent.guard.js';
import { gitLabNoteEventGuard } from '@/modules/platform-integration/entities/gitlab/gitlabNoteEvent.guard.js';
import type { IdempotencyStore } from '@/modules/platform-integration/entities/idempotency/idempotencyStore.gateway.js';
import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import { applyDiffSizeGuard } from '@/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.js';
import {
  filterGitLabEvent,
  filterGitLabMrUpdate,
  filterGitLabMrClose,
  filterGitLabMrMerge,
  filterGitLabMrApprove,
  filterGitLabNoteEvent,
} from '@/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.js';
import {
  sendWebhookReply,
  sendReviewRequestReply,
} from '@/modules/platform-integration/interface-adapters/controllers/webhook/webhookReply.js';
import type { GuardDiffSizeUseCase } from '@/modules/platform-integration/usecases/guardDiffSize.usecase.js';
import type { IsTrustedActorUseCase } from '@/modules/platform-integration/usecases/isTrustedActor.usecase.js';
import { processReviewRequest } from '@/modules/platform-integration/usecases/processReviewRequest.usecase.js';
import type { ProcessWebhook } from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import {
  DEFAULT_FOLLOWUP_AGENTS,
  withMetaSteps,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import type { ProjectPrinciplesGateway } from '@/modules/review-execution/entities/progress/projectPrinciples.gateway.js';
import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type { ProcessorBuilder } from '@/modules/review-execution/services/processorRegistry.js';
import type {
  ExecuteReview,
  ExecuteReviewInput,
} from '@/modules/review-execution/usecases/executeReview.usecase.js';
import type { GateClaudeInvocationUseCase } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import type { HandleClose } from '@/modules/review-execution/usecases/handleClose.usecase.js';
import type { ResolveAuditScopeUseCase } from '@/modules/review-execution/usecases/resolveAuditScope.usecase.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';
import { createTrackedMrId } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import type { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import type { RecordBypassUseCase } from '@/modules/tracking/usecases/tracking/recordBypass.usecase.js';
import type { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import type { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import type { RecordSizeBlockUseCase } from '@/modules/tracking/usecases/tracking/recordSizeBlock.usecase.js';
import type { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import type { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import type { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import type { RemoveWorktreeAction } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import {
  verifyGitLabSignature,
  getGitLabEventType,
  getGitLabEventUuid,
} from '@/security/verifier.js';

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

async function runGitLabReview(
  executeReview: ExecuteReview,
  input: Omit<ExecuteReviewInput, 'platform' | 'notificationPrefix'>,
): Promise<void> {
  const result = await executeReview({
    ...input,
    platform: 'gitlab',
    notificationPrefix: 'MR !',
  });
  if (result.status === 'failed') {
    throw new Error(result.reason);
  }
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
  executeReview: ExecuteReview;
  handleClose: HandleClose;
  processWebhook: ProcessWebhook;
  enforceBudget: Pick<EnforceBudgetUseCase, 'execute'>;
  broadcastBudgetExceeded: (payload: BudgetExceededPayload) => void;
  getRepositories: () => RepositoryConfig[];
  claudeInvokerDeps?: ClaudeInvokerDependencies;
  gateClaudeInvocation?: GateClaudeInvocationUseCase;
  isTrustedActor?: IsTrustedActorUseCase;
  removeWorktree: RemoveWorktreeAction;
  recordBypass: RecordBypassUseCase;
  recordSizeBlock: RecordSizeBlockUseCase;
  noteCommentPostGateway: NoteCommentPostGateway;
  handlePlatformApproval: HandlePlatformApprovalUseCase;
  approvalRevocationGateway: ApprovalRevocationGateway;
  idempotencyStore?: IdempotencyStore;
  getQualityThreshold: (projectPath: string) => number | null;
  guardDiffSize: GuardDiffSizeUseCase;
  getMaxDiffLines: (localPath: string) => number;
  now: () => string;
  projectPrinciplesGateway: ProjectPrinciplesGateway;
  resolveAuditScope: ResolveAuditScopeUseCase;
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
    sendWebhookReply(
      reply,
      { kind: 'ignored', reason: 'Note payload not parseable' },
      { numberKey: 'mrNumber' },
    );
    return;
  }

  const filterResult = filterGitLabNoteEvent(parseResult.data);
  if (!filterResult.shouldProcess) {
    sendWebhookReply(
      reply,
      { kind: 'ignored', reason: filterResult.reason },
      { numberKey: 'mrNumber' },
    );
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
    sendWebhookReply(
      reply,
      { kind: 'ignored', reason: 'Repository not configured' },
      { numberKey: 'mrNumber' },
    );
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
    sendWebhookReply(
      reply,
      { kind: 'ignored', reason: 'MR not tracked' },
      { numberKey: 'mrNumber' },
    );
    return;
  }

  sendWebhookReply(
    reply,
    { kind: 'ignored', reason: 'No bypass marker' },
    { numberKey: 'mrNumber' },
  );
}

export async function handleGitLabWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger,
  deps: GitLabWebhookDependencies,
): Promise<void> {
  const { trackAssignment } = deps;
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
        sendWebhookReply(
          reply,
          { kind: 'ignored', reason: 'Duplicate event' },
          { numberKey: 'mrNumber' },
        );
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
    sendWebhookReply(
      reply,
      { kind: 'ignored', reason: 'Not a MR event' },
      { numberKey: 'mrNumber' },
    );
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

    const repoConfig = findRepositoryByProjectPath(projectPath);
    if (repoConfig) {
      const result = await deps.processWebhook({
        type: 'close',
        platform: 'gitlab',
        projectPath,
        localPath: repoConfig.localPath,
        mergeRequestNumber: mrNumber,
      });

      if (result.type === 'closed') {
        sendWebhookReply(
          reply,
          {
            kind: 'cleaned',
            mergeRequestNumber: mrNumber,
            jobCancelled: result.jobCancelled,
            trackingArchived: result.trackingArchived,
          },
          { numberKey: 'mrNumber' },
        );
        return;
      }
    }

    // No repo config, just acknowledge
    logger.info({ mrNumber, project: projectPath }, 'MR closed but repo not configured');
    sendWebhookReply(
      reply,
      { kind: 'ignored', reason: 'MR closed, repo not configured' },
      { numberKey: 'mrNumber' },
    );
    return;
  }

  // 3b. Check if MR was merged - update tracking state
  const mergeResult = filterGitLabMrMerge(event);
  if (mergeResult.shouldProcess) {
    const repoConfig = findRepositoryByProjectPath(mergeResult.projectPath);
    if (repoConfig) {
      const result = await deps.processWebhook({
        type: 'merge',
        platform: 'gitlab',
        projectPath: mergeResult.projectPath,
        localPath: repoConfig.localPath,
        mergeRequestNumber: mergeResult.mergeRequestNumber,
      });

      if (result.type === 'merged') {
        logger.info({ mrNumber: mergeResult.mergeRequestNumber }, 'MR marked as merged');
        sendWebhookReply(
          reply,
          { kind: 'merged', mergeRequestNumber: mergeResult.mergeRequestNumber },
          { numberKey: 'mrNumber' },
        );
        return;
      }
    }
  }

  // 3c. Check if MR was approved - run gate, revoke on platform if it fails
  const approveResult = filterGitLabMrApprove(event);
  if (approveResult.shouldProcess) {
    const repoConfig = findRepositoryByProjectPath(approveResult.projectPath);
    if (repoConfig) {
      const sizeGuard = await applyDiffSizeGuard({
        projectIdentifier: approveResult.projectPath,
        localPath: repoConfig.localPath,
        mergeRequestNumber: approveResult.mergeRequestNumber,
        mode: 'approve',
        deps: {
          guardDiffSize: deps.guardDiffSize,
          getMaxDiffLines: deps.getMaxDiffLines,
          noteCommentPostGateway: deps.noteCommentPostGateway,
          approvalRevocationGateway: deps.approvalRevocationGateway,
        },
        logger,
      });
      if (sizeGuard.blocked) {
        reply.status(200).send({
          status: 'unapproved',
          mrNumber: approveResult.mergeRequestNumber,
          reason: 'oversized',
        });
        return;
      }

      const result = await deps.processWebhook({
        type: 'approve',
        platform: 'gitlab',
        projectPath: approveResult.projectPath,
        localPath: repoConfig.localPath,
        mergeRequestNumber: approveResult.mergeRequestNumber,
        reviewId: null,
      });

      if (result.type === 'approved') {
        logger.info({ mrNumber: approveResult.mergeRequestNumber }, 'MR marked as approved');
        sendWebhookReply(
          reply,
          { kind: 'approved', mergeRequestNumber: approveResult.mergeRequestNumber },
          { numberKey: 'mrNumber' },
        );
        return;
      }

      if (result.type === 'approval-revoked') {
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
            body: result.revokeMessage,
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
          { mrNumber: approveResult.mergeRequestNumber, reason: result.reason },
          'Platform approval revoked on non-qualified MR',
        );
        sendWebhookReply(
          reply,
          {
            kind: 'unapproved',
            mergeRequestNumber: approveResult.mergeRequestNumber,
            reason: result.reason,
          },
          { numberKey: 'mrNumber' },
        );
        return;
      }

      if (result.type === 'approval-ignored') {
        logger.info(
          { mrNumber: approveResult.mergeRequestNumber, reason: result.reason },
          'GitLab approval ignored',
        );
        sendWebhookReply(
          reply,
          {
            kind: 'ignored-with-number',
            mergeRequestNumber: approveResult.mergeRequestNumber,
            reason: result.reason,
          },
          { numberKey: 'mrNumber' },
        );
        return;
      }
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
        const eligibility = await deps.processWebhook({
          type: 'followup-push',
          platform: 'gitlab',
          projectPath: updateResult.projectPath,
          localPath: updateRepoConfig.localPath,
          mergeRequestNumber: updateResult.mergeRequestNumber,
          mergeRequestUrl: updateResult.mergeRequestUrl,
          sourceBranch: updateResult.sourceBranch,
          targetBranch: updateResult.targetBranch,
        });

        if (
          eligibility.type === 'followup-skipped' &&
          eligibility.reason === 'Auto-followup disabled'
        ) {
          sendWebhookReply(
            reply,
            { kind: 'ignored', reason: 'Auto-followup disabled' },
            { numberKey: 'mrNumber' },
          );
          return;
        }

        if (eligibility.type === 'followup-eligible') {
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

          const followupSizeGuard = await applyDiffSizeGuard({
            projectIdentifier: updateResult.projectPath,
            localPath: updateRepoConfig.localPath,
            mergeRequestNumber: updateResult.mergeRequestNumber,
            mode: 'followup',
            deps: {
              guardDiffSize: deps.guardDiffSize,
              getMaxDiffLines: deps.getMaxDiffLines,
              noteCommentPostGateway: deps.noteCommentPostGateway,
              approvalRevocationGateway: deps.approvalRevocationGateway,
            },
            logger,
          });
          if (followupSizeGuard.blocked) {
            reply.status(200).send({ status: 'rejected', reason: 'oversized' });
            return;
          }

          const followupProcessor = async (j: ReviewJob, signal: AbortSignal): Promise<void> => {
            await runGitLabReview(deps.executeReview, {
              job: j,
              signal,
              isFollowup: true,
              agents: getFollowupAgents(j.localPath) ?? DEFAULT_FOLLOWUP_AGENTS,
              baseUrl: extractBaseUrl(updateRepoConfig.remoteUrl),
              qualityThreshold: loadProjectConfig(j.localPath)?.qualityThreshold ?? null,
            });
          };

          const followupVerdict = await processReviewRequest(
            {
              job: followupJob,
              processor: followupProcessor,
              triggerSource: 'webhook-followup',
              localPaths: listEnabledLocalPaths(deps.getRepositories),
              actorUsername: event.user.username,
              projectPath: updateResult.projectPath,
              gateActorTrust: true,
            },
            {
              enforceBudget: deps.enforceBudget,
              gateClaudeInvocation: deps.gateClaudeInvocation,
              isTrustedActor: deps.isTrustedActor,
              enqueue: enqueueReview,
              logger,
            },
          );

          sendReviewRequestReply(reply, followupVerdict, {
            numberKey: 'mrNumber',
            mergeRequestNumber: updateResult.mergeRequestNumber,
            jobId: followupJobId,
            flow: 'followup',
            onBudgetExceeded: (status) => {
              logger.warn(
                {
                  mrNumber: followupJob.mrNumber,
                  limitUsd: status.limitUsd,
                  consumedUsd: status.consumedUsd,
                },
                'Budget exceeded, followup not enqueued',
              );
              deps.broadcastBudgetExceeded({
                mrNumber: followupJob.mrNumber,
                platform: 'gitlab',
                projectPath: followupJob.projectPath,
                limitUsd: status.limitUsd,
                consumedUsd: status.consumedUsd,
              });
            },
          });
          return;
        }
      }
    }

    sendWebhookReply(
      reply,
      { kind: 'ignored', reason: filterResult.reason },
      { numberKey: 'mrNumber' },
    );
    return;
  }

  // 4. Find repository configuration
  const repoConfig = findRepositoryByProjectPath(filterResult.projectPath);
  if (!repoConfig) {
    logger.warn({ projectPath: filterResult.projectPath }, 'Projet non configuré');
    sendWebhookReply(
      reply,
      { kind: 'ignored', reason: 'Repository not configured' },
      { numberKey: 'mrNumber' },
    );
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

  const reviewSizeGuard = await applyDiffSizeGuard({
    projectIdentifier: filterResult.projectPath,
    localPath: repoConfig.localPath,
    mergeRequestNumber: filterResult.mergeRequestNumber,
    mode: 'review',
    deps: {
      guardDiffSize: deps.guardDiffSize,
      getMaxDiffLines: deps.getMaxDiffLines,
      noteCommentPostGateway: deps.noteCommentPostGateway,
      approvalRevocationGateway: deps.approvalRevocationGateway,
    },
    logger,
  });
  if (reviewSizeGuard.blocked) {
    deps.recordSizeBlock.execute({
      projectPath: repoConfig.localPath,
      mrId: createTrackedMrId('gitlab', filterResult.projectPath, filterResult.mergeRequestNumber),
      countedLines: reviewSizeGuard.countedLines,
      budget: reviewSizeGuard.budget,
      message: reviewSizeGuard.message,
      now: deps.now,
    });
    reply.status(200).send({ status: 'rejected', reason: 'oversized' });
    return;
  }

  const reviewProcessor = buildGitLabReviewProcessor(deps, logger)(job);

  const verdict = await processReviewRequest(
    {
      job,
      processor: reviewProcessor,
      triggerSource: 'webhook-initial',
      localPaths: listEnabledLocalPaths(deps.getRepositories),
      actorUsername: event.user.username,
      projectPath: filterResult.projectPath,
      gateActorTrust: true,
    },
    {
      enforceBudget: deps.enforceBudget,
      gateClaudeInvocation: deps.gateClaudeInvocation,
      isTrustedActor: deps.isTrustedActor,
      enqueue: enqueueReview,
      logger,
    },
  );

  sendReviewRequestReply(reply, verdict, {
    numberKey: 'mrNumber',
    mergeRequestNumber: filterResult.mergeRequestNumber,
    jobId,
    flow: 'initial',
    onBudgetExceeded: (status) => {
      logger.warn(
        { mrNumber: job.mrNumber, limitUsd: status.limitUsd, consumedUsd: status.consumedUsd },
        'Budget exceeded, review not enqueued',
      );
      deps.broadcastBudgetExceeded({
        mrNumber: job.mrNumber,
        platform: 'gitlab',
        projectPath: job.projectPath,
        limitUsd: status.limitUsd,
        consumedUsd: status.consumedUsd,
      });
    },
  });
}

type GitLabReviewProcessorDeps = Pick<
  GitLabWebhookDependencies,
  | 'reviewContextGateway'
  | 'diffStatsFetchGateway'
  | 'recordCompletion'
  | 'noteCommentPostGateway'
  | 'executeReview'
  | 'projectPrinciplesGateway'
  | 'resolveAuditScope'
>;

export function buildGitLabReviewProcessor(
  deps: GitLabReviewProcessorDeps,
  _logger: Logger,
): ProcessorBuilder {
  return (_job: ReviewJob) =>
    async (j: ReviewJob, signal: AbortSignal): Promise<void> => {
      const repoConfig = findRepositoryByProjectPath(j.projectPath);
      if (!repoConfig) {
        throw new Error(`No GitLab repository configured for projectPath "${j.projectPath}"`);
      }
      const config = loadProjectConfig(j.localPath);
      const signals = deps.projectPrinciplesGateway.readSignals(j.localPath);
      const scope = deps.resolveAuditScope.execute({
        audits: config?.audits ?? null,
        agents: config?.agents ?? null,
        focus: config?.reviewFocus ?? null,
        signals,
      });
      j.auditScope = scope;
      await runGitLabReview(deps.executeReview, {
        job: j,
        signal,
        isFollowup: false,
        agents: withMetaSteps(scope),
        baseUrl: extractBaseUrl(repoConfig.remoteUrl),
        qualityThreshold: config?.qualityThreshold ?? null,
      });
    };
}
