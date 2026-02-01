import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { verifyGitHubSignature, getGitHubEventType } from '../../../security/verifier.js';
import { filterGitHubEvent, filterGitHubLabelEvent, filterGitHubPrClose } from './eventFilter.js';
import { gitHubPullRequestEventGuard } from '../../../entities/github/githubPullRequestEvent.guard.js';
import { findRepositoryByRemoteUrl } from '../../../config/loader.js';
import {
  enqueueReview,
  createJobId,
  updateJobProgress,
  cancelJob,
  type ReviewJob,
} from '../../../queue/reviewQueue.js';
import {
  trackMrAssignment,
  recordReviewCompletion,
  archiveMr,
} from '../../../services/mrTrackingService.js';
import { parseReviewOutput } from '../../../services/statsService.js';
import { parseThreadActions } from '../../../services/threadActionsParser.js';
import { executeThreadActions, defaultCommandExecutor } from '../../../services/threadActionsExecutor.js';
import { invokeClaudeReview, sendNotification } from '../../../claude/invoker.js';

export async function handleGitHubWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger
): Promise<void> {
  // 1. Verify signature
  const verification = verifyGitHubSignature(request);
  if (!verification.valid) {
    logger.warn({ error: verification.error }, 'GitHub signature verification failed');
    reply.status(401).send({ error: verification.error });
    return;
  }

  // 2. Check event type
  const eventType = getGitHubEventType(request);
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
    const mrId = `github-${projectPath}-${prNumber}`;

    // Find repo config
    const repoConfig = findRepositoryByRemoteUrl(event.repository.clone_url);
    if (repoConfig) {
      // Cancel any running job for this PR
      const jobId = createJobId('github', projectPath, prNumber);
      const cancelled = cancelJob(jobId);

      // Archive the PR from tracking
      const archived = archiveMr(repoConfig.localPath, mrId);

      logger.info(
        {
          prNumber,
          repo: projectPath,
          jobCancelled: cancelled,
          trackingArchived: archived,
        },
        'PR closed - cleaned up tracking and cancelled job'
      );

      reply.status(200).send({
        status: 'cleaned',
        prNumber,
        jobCancelled: cancelled,
        trackingArchived: archived,
      });
      return;
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
    'GitHub PR event received'
  );

  if (!filterResult.shouldProcess) {
    reply.status(200).send({ status: 'ignored', reason: filterResult.reason });
    return;
  }

  // 4. Find repository configuration
  const repoConfig = findRepositoryByRemoteUrl(event.repository.clone_url);
  if (!repoConfig) {
    logger.warn(
      { cloneUrl: event.repository.clone_url },
      'Projet non configuré'
    );
    reply.status(200).send({
      status: 'ignored',
      reason: 'Repository not configured',
    });
    return;
  }

  // 5. Track PR assignment with user info
  const prTitle = event.pull_request?.title || `PR #${filterResult.mergeRequestNumber}`;
  const assignedBy = {
    username: event.sender?.login || 'unknown',
    displayName: event.sender?.login,
  };

  trackMrAssignment(
    repoConfig.localPath,
    {
      mrNumber: filterResult.mergeRequestNumber,
      title: prTitle,
      url: filterResult.mergeRequestUrl,
      project: filterResult.projectPath,
      platform: 'github',
      sourceBranch: filterResult.sourceBranch,
      targetBranch: filterResult.targetBranch,
    },
    assignedBy
  );

  logger.info(
    { prNumber: filterResult.mergeRequestNumber, assignedBy: assignedBy.username },
    'PR tracked for review'
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
  };

  const enqueued = await enqueueReview(job, async (j, signal) => {
    // Send start notification
    sendNotification(
      'Review démarrée',
      `PR #${j.mrNumber} - ${j.projectPath}`,
      logger
    );

    // Invoke Claude with progress tracking and cancellation support
    const result = await invokeClaudeReview(j, logger, (progress, event) => {
      updateJobProgress(j.id, progress, event);
    }, signal);

    // Send completion notification and record stats
    if (result.cancelled) {
      sendNotification(
        'Review annulée',
        `PR #${j.mrNumber} - ${j.projectPath}`,
        logger
      );
    } else if (result.success) {
      // Parse review output for stats
      const parsed = parseReviewOutput(result.stdout);

      // Execute thread actions from markers
      const threadActions = parseThreadActions(result.stdout);
      if (threadActions.length > 0) {
        const actionResult = await executeThreadActions(
          threadActions,
          {
            platform: 'github',
            projectPath: j.projectPath,
            mrNumber: j.mrNumber,
            localPath: j.localPath,
          },
          logger,
          defaultCommandExecutor
        );
        logger.info(
          { ...actionResult, prNumber: j.mrNumber },
          'Thread actions executed for review'
        );
      }

      // Record review completion with parsed stats
      recordReviewCompletion(
        j.localPath,
        `github-${j.projectPath}-${j.mrNumber}`,
        {
          type: 'review',
          durationMs: result.durationMs,
          score: parsed.score,
          blocking: parsed.blocking,
          warnings: parsed.warnings,
          suggestions: parsed.suggestions,
          threadsOpened: parsed.blocking + parsed.warnings,
        }
      );

      logger.info(
        {
          prNumber: j.mrNumber,
          score: parsed.score,
          blocking: parsed.blocking,
          warnings: parsed.warnings,
          suggestions: parsed.suggestions,
          durationMs: result.durationMs,
        },
        'Review stats recorded'
      );

      sendNotification(
        'Review terminée',
        `PR #${j.mrNumber} - ${j.projectPath}`,
        logger
      );
    } else {
      sendNotification(
        'Review échouée',
        `PR #${j.mrNumber} - Code ${result.exitCode}`,
        logger
      );
    }
  });

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
