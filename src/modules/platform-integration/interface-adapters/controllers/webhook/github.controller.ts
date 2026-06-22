import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';

import { findRepositoryByRemoteUrl, type RepositoryConfig } from '@/config/loader.js';
import {
  loadProjectConfig,
  getProjectAgentsOrFocusDefaults,
  getFollowupAgents,
  getProjectLanguage,
} from '@/config/projectConfig.js';
import type { ClaudeInvokerDependencies } from '@/frameworks/claude/claudeInvoker.js';
import { enqueueReview, createJobId } from '@/frameworks/queue/pQueueAdapter.js';
import type { BudgetExceededPayload } from '@/main/websocket.js';
import type { ApprovalRevocationGateway } from '@/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.js';
import type { DiffMetadataFetchGateway } from '@/modules/platform-integration/entities/diffMetadata/diffMetadata.gateway.js';
import { gitHubIssueCommentEventGuard } from '@/modules/platform-integration/entities/github/githubIssueCommentEvent.guard.js';
import { gitHubPullRequestEventGuard } from '@/modules/platform-integration/entities/github/githubPullRequestEvent.guard.js';
import { gitHubPullRequestReviewEventGuard } from '@/modules/platform-integration/entities/github/githubPullRequestReviewEvent.guard.js';
import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import { applyDiffSizeGuard } from '@/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.js';
import {
  filterGitHubEvent,
  filterGitHubLabelEvent,
  filterGitHubPrClose,
  filterGitHubPrUpdate,
  filterGitHubIssueCommentEvent,
  filterGitHubPullRequestReviewEvent,
} from '@/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.js';
import type { GuardDiffSizeUseCase } from '@/modules/platform-integration/usecases/guardDiffSize.usecase.js';
import type { ProcessWebhook } from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import {
  DEFAULT_AGENTS,
  DEFAULT_FOLLOWUP_AGENTS,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type { ProcessorBuilder } from '@/modules/review-execution/services/processorRegistry.js';
import type {
  ExecuteReview,
  ExecuteReviewInput,
} from '@/modules/review-execution/usecases/executeReview.usecase.js';
import type { GateClaudeInvocationUseCase } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import type { HandleClose } from '@/modules/review-execution/usecases/handleClose.usecase.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';
import { evaluateQualityGate } from '@/modules/tracking/entities/qualityGate/qualityGate.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import type { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import type { RecordBypassUseCase } from '@/modules/tracking/usecases/tracking/recordBypass.usecase.js';
import type { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import type { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import type { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import type { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import type { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import type { RemoveWorktreeAction } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { verifyGitHubSignature, getGitHubEventType } from '@/security/verifier.js';

export interface GitHubWebhookDependencies {
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
  removeWorktree: RemoveWorktreeAction;
  recordBypass: RecordBypassUseCase;
  noteCommentPostGateway: NoteCommentPostGateway;
  handlePlatformApproval: HandlePlatformApprovalUseCase;
  approvalRevocationGateway: ApprovalRevocationGateway;
  getQualityThreshold: (projectPath: string) => number | null;
  guardDiffSize: GuardDiffSizeUseCase;
  getMaxDiffLines: (localPath: string) => number;
  now: () => string;
}

function listEnabledLocalPaths(getRepositories: () => RepositoryConfig[]): string[] {
  return getRepositories()
    .filter((repository) => repository.enabled)
    .map((repository) => repository.localPath);
}

function computeSourceForkCloneUrl(pullRequest: {
  head: { repo?: { full_name: string; clone_url: string } };
  base: { repo?: { full_name: string } };
}): string | undefined {
  const headRepo = pullRequest.head.repo;
  const baseRepo = pullRequest.base.repo;
  if (!headRepo || !baseRepo) return undefined;
  if (headRepo.full_name === baseRepo.full_name) return undefined;
  return headRepo.clone_url;
}

function shortDismissalLabel(reason: 'below-threshold' | 'blockers-present'): string {
  if (reason === 'below-threshold') return 'Seuil qualité non atteint';
  return 'Issues bloquantes non résolues';
}

async function runGitHubReview(
  executeReview: ExecuteReview,
  input: Omit<ExecuteReviewInput, 'platform' | 'notificationPrefix'>,
): Promise<void> {
  const result = await executeReview({
    ...input,
    platform: 'github',
    notificationPrefix: 'PR #',
  });
  if (result.status === 'failed') {
    throw new Error(result.reason);
  }
}

async function handleGitHubPullRequestReviewHook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger,
  deps: GitHubWebhookDependencies,
): Promise<void> {
  const parseResult = gitHubPullRequestReviewEventGuard.safeParse(request.body);
  if (!parseResult.success) {
    logger.debug(
      { errors: parseResult.error },
      'Invalid GitHub pull_request_review payload (ignored)',
    );
    reply
      .status(200)
      .send({ status: 'ignored', reason: 'pull_request_review payload not parseable' });
    return;
  }

  const filterResult = filterGitHubPullRequestReviewEvent(parseResult.data);
  if (!filterResult.shouldProcess) {
    reply.status(200).send({ status: 'ignored', reason: filterResult.reason });
    return;
  }

  const repoConfig = findRepositoryByRemoteUrl(parseResult.data.repository.clone_url);
  if (!repoConfig) {
    logger.debug(
      { projectPath: filterResult.projectPath },
      'Pull request review for unconfigured repository (ignored)',
    );
    reply.status(200).send({ status: 'ignored', reason: 'Repository not configured' });
    return;
  }

  const sizeGuard = await applyDiffSizeGuard({
    projectIdentifier: filterResult.projectPath,
    localPath: repoConfig.localPath,
    mergeRequestNumber: filterResult.mergeRequestNumber,
    mode: 'approve',
    revokeArgs: { reviewId: filterResult.reviewId, dismissalMessage: 'oversized' },
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
      prNumber: filterResult.mergeRequestNumber,
      reason: 'oversized',
    });
    return;
  }

  const mrId = `github-${filterResult.projectPath}-${filterResult.mergeRequestNumber}`;
  const threshold = deps.getQualityThreshold(repoConfig.localPath);
  const transitionResult = deps.transitionState.execute({
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
    logger.info({ prNumber: filterResult.mergeRequestNumber }, 'PR marked as approved');
    reply.status(200).send({ status: 'approved', prNumber: filterResult.mergeRequestNumber });
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
          projectPath: filterResult.projectPath,
          mrNumber: filterResult.mergeRequestNumber,
          reviewId: filterResult.reviewId,
          dismissalMessage: shortDismissalLabel(verdict.reason),
        });
      } catch (error) {
        logger.warn(
          {
            prNumber: filterResult.mergeRequestNumber,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to dismiss GitHub approval review; continuing with FR comment',
        );
      }

      try {
        await deps.noteCommentPostGateway.postComment({
          projectPath: filterResult.projectPath,
          mrNumber: filterResult.mergeRequestNumber,
          body: verdict.message,
        });
      } catch (error) {
        logger.warn(
          {
            prNumber: filterResult.mergeRequestNumber,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to post FR explanation comment after dismissing GitHub approval',
        );
      }

      logger.info(
        { prNumber: filterResult.mergeRequestNumber, reason: verdict.reason },
        'Platform approval revoked on non-qualified PR',
      );
      reply.status(200).send({
        status: 'unapproved',
        prNumber: filterResult.mergeRequestNumber,
        reason: verdict.reason,
      });
      return;
    }

    reply.status(200).send({
      status: 'ignored',
      prNumber: filterResult.mergeRequestNumber,
      reason: verdict.kind,
    });
    return;
  }

  reply.status(200).send({
    status: 'ignored',
    prNumber: filterResult.mergeRequestNumber,
    reason: transitionResult.reason,
  });
}

async function handleGitHubIssueCommentHook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger,
  deps: GitHubWebhookDependencies,
): Promise<void> {
  const parseResult = gitHubIssueCommentEventGuard.safeParse(request.body);
  if (!parseResult.success) {
    logger.debug({ errors: parseResult.error }, 'Invalid GitHub issue_comment payload (ignored)');
    reply.status(200).send({ status: 'ignored', reason: 'Comment payload not parseable' });
    return;
  }

  const filterResult = filterGitHubIssueCommentEvent(parseResult.data);
  if (!filterResult.shouldProcess) {
    reply.status(200).send({ status: 'ignored', reason: filterResult.reason });
    return;
  }

  const repoConfig = findRepositoryByRemoteUrl(parseResult.data.repository.clone_url);
  if (!repoConfig) {
    logger.debug(
      { projectPath: filterResult.projectPath },
      'Comment for unconfigured repository (ignored)',
    );
    reply.status(200).send({ status: 'ignored', reason: 'Repository not configured' });
    return;
  }

  const mrId = `github-${filterResult.projectPath}-${filterResult.mergeRequestNumber}`;
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
      'Bypass recorded on tracked PR',
    );
    reply.status(200).send({ status: 'bypass-recorded' });
    return;
  }

  if (result.kind === 'mr-not-found') {
    reply.status(200).send({ status: 'ignored', reason: 'PR not tracked' });
    return;
  }

  reply.status(200).send({ status: 'ignored', reason: 'No bypass marker' });
}

export async function handleGitHubWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger,
  _trackingGateway: ReviewRequestTrackingGateway,
  deps: GitHubWebhookDependencies,
): Promise<void> {
  const { trackAssignment } = deps;
  // 1. Verify signature
  const verification = verifyGitHubSignature(request);
  if (!verification.valid) {
    logger.warn({ error: verification.error }, 'GitHub signature verification failed');
    reply.status(401).send({ error: verification.error });
    return;
  }

  // 2. Check event type
  const eventType = getGitHubEventType(request);

  if (eventType === 'issue_comment') {
    await handleGitHubIssueCommentHook(request, reply, logger, deps);
    return;
  }

  if (eventType === 'pull_request_review') {
    await handleGitHubPullRequestReviewHook(request, reply, logger, deps);
    return;
  }

  if (eventType !== 'pull_request') {
    logger.debug({ eventType }, 'Ignoring non-PR event');
    reply.status(200).send({ status: 'ignored', reason: 'Not a PR event' });
    return;
  }

  // 3. Parse and validate event payload
  const parseResult = gitHubPullRequestEventGuard.safeParse(request.body);
  if (!parseResult.success) {
    logger.warn({ errors: parseResult.error }, 'Invalid GitHub webhook payload');
    reply.status(400).send({ error: 'Invalid webhook payload' });
    return;
  }
  const event = parseResult.data;

  // 3a. Check if PR was closed - clean up tracking and cancel any running job
  const closeResult = filterGitHubPrClose(event);
  if (closeResult.shouldProcess) {
    const projectPath = closeResult.projectPath;
    const prNumber = closeResult.mergeRequestNumber;

    const repoConfig = findRepositoryByRemoteUrl(event.repository.clone_url);
    if (repoConfig) {
      const result = await deps.processWebhook({
        type: 'close',
        platform: 'github',
        projectPath,
        localPath: repoConfig.localPath,
        mergeRequestNumber: prNumber,
      });

      if (result.type === 'closed') {
        reply.status(200).send({
          status: 'cleaned',
          prNumber,
          jobCancelled: result.jobCancelled,
          trackingArchived: result.trackingArchived,
        });
        return;
      }
    }

    // No repo config, just acknowledge
    logger.info({ prNumber, repo: projectPath }, 'PR closed but repo not configured');
    reply.status(200).send({ status: 'ignored', reason: 'PR closed, repo not configured' });
    return;
  }

  // 3b. Filter for review request OR label trigger
  let filterResult = filterGitHubEvent(event);

  // If not a review request, check for label trigger
  if (!filterResult.shouldProcess) {
    filterResult = filterGitHubLabelEvent(event);
  }

  logger.info(
    {
      repo: event.repository?.full_name,
      prNumber: event.pull_request?.number,
      action: event.action,
      shouldProcess: filterResult.shouldProcess,
      reason: filterResult.reason,
    },
    'GitHub PR event received',
  );

  if (!filterResult.shouldProcess) {
    const updateResult = filterGitHubPrUpdate(event);
    logger.debug({ updateResult, action: event.action }, 'Checking for followup review');

    if (updateResult.shouldProcess && updateResult.isFollowup) {
      const updateRepoConfig = findRepositoryByRemoteUrl(event.repository.clone_url);
      if (updateRepoConfig) {
        const eligibility = await deps.processWebhook({
          type: 'followup-push',
          platform: 'github',
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
          reply.status(200).send({ status: 'ignored', reason: 'Auto-followup disabled' });
          return;
        }

        if (eligibility.type === 'followup-eligible') {
          logger.info(
            { prNumber: updateResult.mergeRequestNumber, project: updateResult.projectPath },
            'Auto-triggering followup review after push',
          );

          const projectConfig = loadProjectConfig(updateRepoConfig.localPath);
          const skill = projectConfig?.reviewFollowupSkill || 'review-followup';

          const followupJobId = createJobId(
            'github-followup',
            updateResult.projectPath,
            updateResult.mergeRequestNumber,
          );
          const followupJob: ReviewJob = {
            id: followupJobId,
            platform: 'github',
            projectPath: updateResult.projectPath,
            localPath: updateRepoConfig.localPath,
            mrNumber: updateResult.mergeRequestNumber,
            skill,
            mrUrl: updateResult.mergeRequestUrl,
            sourceBranch: updateResult.sourceBranch,
            targetBranch: updateResult.targetBranch,
            jobType: 'followup',
            sourceForkCloneUrl: computeSourceForkCloneUrl(event.pull_request),
          };

          const followupBudgetDecision = await deps.enforceBudget.execute({
            localPaths: listEnabledLocalPaths(deps.getRepositories),
          });
          if (!followupBudgetDecision.accepted) {
            logger.warn(
              {
                prNumber: followupJob.mrNumber,
                limitUsd: followupBudgetDecision.status.limitUsd,
                consumedUsd: followupBudgetDecision.status.consumedUsd,
              },
              'Budget exceeded, followup not enqueued',
            );
            deps.broadcastBudgetExceeded({
              mrNumber: followupJob.mrNumber,
              platform: 'github',
              projectPath: followupJob.projectPath,
              limitUsd: followupBudgetDecision.status.limitUsd,
              consumedUsd: followupBudgetDecision.status.consumedUsd,
            });
            reply.status(200).send({ status: 'rejected', reason: 'budget-exceeded' });
            return;
          }

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
            await runGitHubReview(deps.executeReview, {
              job: j,
              signal,
              isFollowup: true,
              agents: getFollowupAgents(j.localPath) ?? DEFAULT_FOLLOWUP_AGENTS,
              baseUrl: null,
              qualityThreshold: loadProjectConfig(j.localPath)?.qualityThreshold ?? null,
            });
          };

          if (deps.gateClaudeInvocation) {
            const gateResult = await deps.gateClaudeInvocation.execute({
              job: followupJob,
              triggerSource: 'webhook-followup',
              processor: followupProcessor,
            });
            if (gateResult.status === 'pending') {
              reply.status(202).send({
                status: 'pending-confirmation',
                pendingId: gateResult.pendingId,
                prNumber: updateResult.mergeRequestNumber,
              });
              return;
            }
          } else {
            await enqueueReview(followupJob, followupProcessor);
          }

          reply.status(202).send({
            status: 'followup-queued',
            jobId: followupJobId,
            prNumber: updateResult.mergeRequestNumber,
          });
          return;
        }
      }
    }

    reply.status(200).send({ status: 'ignored', reason: filterResult.reason });
    return;
  }

  // 4. Find repository configuration
  const repoConfig = findRepositoryByRemoteUrl(event.repository.clone_url);
  if (!repoConfig) {
    logger.warn({ cloneUrl: event.repository.clone_url }, 'Projet non configuré');
    reply.status(200).send({
      status: 'ignored',
      reason: 'Repository not configured',
    });
    return;
  }

  // 5. Track PR assignment with user info
  // Use PR assignee (actual owner), not webhook sender (who requested the review)
  const prTitle = event.pull_request?.title || `PR #${filterResult.mergeRequestNumber}`;
  const prAssignee = event.pull_request?.assignees?.[0];
  const assignedBy = {
    username: prAssignee?.login || event.sender?.login || 'unknown',
    displayName: prAssignee?.login || event.sender?.login,
  };
  const prAuthorLogin = event.pull_request?.user?.login;
  const author = prAuthorLogin
    ? { username: prAuthorLogin, displayName: prAuthorLogin }
    : undefined;
  const sizeMetrics =
    event.pull_request?.additions !== undefined ||
    event.pull_request?.deletions !== undefined ||
    event.pull_request?.changed_files !== undefined
      ? {
          additions: event.pull_request?.additions ?? null,
          deletions: event.pull_request?.deletions ?? null,
          filesChanged: event.pull_request?.changed_files ?? null,
        }
      : undefined;

  trackAssignment.execute({
    projectPath: repoConfig.localPath,
    mrInfo: {
      mrNumber: filterResult.mergeRequestNumber,
      title: prTitle,
      url: filterResult.mergeRequestUrl,
      project: filterResult.projectPath,
      platform: 'github',
      sourceBranch: filterResult.sourceBranch,
      targetBranch: filterResult.targetBranch,
    },
    assignedBy,
  });

  logger.info(
    { prNumber: filterResult.mergeRequestNumber, assignedBy: assignedBy.username },
    'PR tracked for review',
  );

  // 6. Create and enqueue job
  const jobId = createJobId('github', filterResult.projectPath, filterResult.mergeRequestNumber);
  const job: ReviewJob = {
    id: jobId,
    platform: 'github',
    projectPath: filterResult.projectPath,
    localPath: repoConfig.localPath,
    mrNumber: filterResult.mergeRequestNumber,
    skill: repoConfig.skill,
    mrUrl: filterResult.mergeRequestUrl,
    sourceBranch: filterResult.sourceBranch,
    targetBranch: filterResult.targetBranch,
    jobType: 'review',
    language: getProjectLanguage(repoConfig.localPath),
    title: prTitle,
    description: event.pull_request?.body,
    assignedBy,
    author,
    sizeMetrics,
    sourceForkCloneUrl: computeSourceForkCloneUrl(event.pull_request),
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
      platform: 'github',
      projectPath: job.projectPath,
      limitUsd: budgetDecision.status.limitUsd,
      consumedUsd: budgetDecision.status.consumedUsd,
    });
    reply.status(200).send({ status: 'rejected', reason: 'budget-exceeded' });
    return;
  }

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
    reply.status(200).send({ status: 'rejected', reason: 'oversized' });
    return;
  }

  const reviewProcessor = buildGitHubReviewProcessor(deps, logger)(job);

  if (deps.gateClaudeInvocation) {
    const gateResult = await deps.gateClaudeInvocation.execute({
      job,
      triggerSource: 'webhook-initial',
      processor: reviewProcessor,
    });
    if (gateResult.status === 'pending') {
      reply.status(202).send({
        status: 'pending-confirmation',
        pendingId: gateResult.pendingId,
        prNumber: filterResult.mergeRequestNumber,
      });
      return;
    }
    if (gateResult.status === 'enqueued') {
      reply.status(202).send({
        status: 'queued',
        jobId,
        prNumber: filterResult.mergeRequestNumber,
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

  const enqueued = await enqueueReview(job, reviewProcessor);

  if (enqueued) {
    reply.status(202).send({
      status: 'queued',
      jobId,
      prNumber: filterResult.mergeRequestNumber,
    });
  } else {
    reply.status(200).send({
      status: 'deduplicated',
      jobId,
      reason: 'Review already in progress or recently completed',
    });
  }
}

type GitHubReviewProcessorDeps = Pick<
  GitHubWebhookDependencies,
  | 'reviewContextGateway'
  | 'diffStatsFetchGateway'
  | 'recordCompletion'
  | 'noteCommentPostGateway'
  | 'executeReview'
>;

export function buildGitHubReviewProcessor(
  deps: GitHubReviewProcessorDeps,
  _logger: Logger,
): ProcessorBuilder {
  return (_job: ReviewJob) =>
    async (j: ReviewJob, signal: AbortSignal): Promise<void> => {
      await runGitHubReview(deps.executeReview, {
        job: j,
        signal,
        isFollowup: false,
        agents: getProjectAgentsOrFocusDefaults(j.localPath) ?? DEFAULT_AGENTS,
        baseUrl: null,
        qualityThreshold: loadProjectConfig(j.localPath)?.qualityThreshold ?? null,
      });
    };
}
