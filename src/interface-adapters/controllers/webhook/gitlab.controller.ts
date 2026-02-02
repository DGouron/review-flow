import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { verifyGitLabSignature, getGitLabEventType } from '../../../security/verifier.js';
import { filterGitLabEvent, filterGitLabMrUpdate, filterGitLabMrClose, type GitLabMergeRequestEvent } from './eventFilter.js';
import { findRepositoryByProjectPath } from '../../../config/loader.js';
import {
  enqueueReview,
  createJobId,
  updateJobProgress,
  cancelJob,
  type ReviewJob,
} from '../../../queue/reviewQueue.js';
import { invokeClaudeReview, sendNotification } from '../../../claude/invoker.js';
import {
  needsFollowupReview,
  recordMrPush,
  trackMrAssignment,
  recordReviewCompletion,
  syncSingleMrThreads,
  archiveMr,
} from '../../../services/mrTrackingService.js';
import { loadProjectConfig } from '../../../config/projectConfig.js';
import { parseReviewOutput } from '../../../services/statsService.js';
import { parseThreadActions } from '../../../services/threadActionsParser.js';
import { executeThreadActions, defaultCommandExecutor } from '../../../services/threadActionsExecutor.js';
import { ReviewContextFileSystemGateway } from '../../gateways/reviewContext.fileSystem.gateway.js';
import { GitLabThreadFetchGateway, defaultGitLabExecutor } from '../../gateways/threadFetch.gitlab.gateway.js';

export async function handleGitLabWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger
): Promise<void> {
  // 1. Verify signature
  const verification = verifyGitLabSignature(request);
  if (!verification.valid) {
    logger.warn({ error: verification.error }, 'GitLab signature verification failed');
    reply.status(401).send({ error: verification.error });
    return;
  }

  // 2. Check event type
  const eventType = getGitLabEventType(request);
  if (eventType !== 'Merge Request Hook') {
    logger.debug({ eventType }, 'Ignoring non-MR event');
    reply.status(200).send({ status: 'ignored', reason: 'Not a MR event' });
    return;
  }

  // 3. Parse event
  const event = request.body as GitLabMergeRequestEvent;

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
      const archived = archiveMr(repoConfig.localPath, mrId);

      // Delete review context file
      const contextGateway = new ReviewContextFileSystemGateway();
      const contextDeleted = contextGateway.delete(repoConfig.localPath, mrId);

      logger.info(
        {
          mrNumber,
          project: projectPath,
          jobCancelled: cancelled,
          trackingArchived: archived,
          contextDeleted: contextDeleted.deleted,
        },
        'MR closed - cleaned up tracking and cancelled job'
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

  // 3b. Filter for review assignment
  const filterResult = filterGitLabEvent(event);

  // Debug: log reviewers data
  logger.info(
    {
      project: event.project?.path_with_namespace,
      mrIid: event.object_attributes?.iid,
      action: event.object_attributes?.action,
      reviewers: event.reviewers?.map(r => r.username) || 'NONE',
      changesReviewers: event.changes?.reviewers ? 'YES' : 'NO',
      shouldProcess: filterResult.shouldProcess,
      reason: filterResult.reason,
    },
    'GitLab MR event received'
  );

  if (!filterResult.shouldProcess) {
    // Check if this is an MR update that might need a followup review
    const updateResult = filterGitLabMrUpdate(event);
    logger.debug(
      { updateResult, action: event.object_attributes?.action },
      'Checking for followup review'
    );

    if (updateResult.shouldProcess && updateResult.isFollowup) {
      // Find repo config to get local path
      const updateRepoConfig = findRepositoryByProjectPath(updateResult.projectPath);
      if (updateRepoConfig) {
        // Record the push event
        const mr = recordMrPush(updateRepoConfig.localPath, updateResult.mergeRequestNumber, 'gitlab');
        logger.info(
          {
            mrNumber: updateResult.mergeRequestNumber,
            mrFound: !!mr,
            mrState: mr?.state,
            lastPushAt: mr?.lastPushAt,
            lastReviewAt: mr?.lastReviewAt,
          },
          'Push event recorded'
        );

        // Check if this MR needs a followup (has open threads and was pushed since last review)
        const needsFollowup = mr && needsFollowupReview(updateRepoConfig.localPath, updateResult.mergeRequestNumber, 'gitlab');
        logger.info({ needsFollowup, mrState: mr?.state }, 'Followup check result');

        if (needsFollowup) {
          logger.info(
            { mrNumber: updateResult.mergeRequestNumber, project: updateResult.projectPath },
            'Auto-triggering followup review after push'
          );

          const projectConfig = loadProjectConfig(updateRepoConfig.localPath);
          const skill = projectConfig?.reviewFollowupSkill || 'review-followup';

          const followupJobId = createJobId('gitlab-followup', updateResult.projectPath, updateResult.mergeRequestNumber);
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

          enqueueReview(followupJob, async (j, signal) => {
            sendNotification('Review followup démarrée', `MR !${j.mrNumber} - ${j.projectPath}`, logger);

            // Create review context file with pre-fetched threads
            const mergeRequestId = `gitlab-${j.projectPath}-${j.mrNumber}`;
            const contextGateway = new ReviewContextFileSystemGateway();
            const threadFetchGateway = new GitLabThreadFetchGateway(defaultGitLabExecutor);

            try {
              const threads = threadFetchGateway.fetchThreads(j.projectPath, j.mrNumber);
              contextGateway.create({
                localPath: j.localPath,
                mergeRequestId,
                platform: 'gitlab',
                projectPath: j.projectPath,
                mergeRequestNumber: j.mrNumber,
                threads,
              });
              logger.info(
                { mrNumber: j.mrNumber, threadsCount: threads.length },
                'Review context file created with threads for followup'
              );
            } catch (error) {
              logger.warn(
                { mrNumber: j.mrNumber, error: error instanceof Error ? error.message : String(error) },
                'Failed to create review context file for followup, continuing without it'
              );
            }

            const result = await invokeClaudeReview(j, logger, (progress, progressEvent) => {
              updateJobProgress(j.id, progress, progressEvent);
            }, signal);

            if (result.success) {
              // Parse review output for stats
              const parsed = parseReviewOutput(result.stdout);

              // Execute thread actions from markers
              const threadActions = parseThreadActions(result.stdout);
              if (threadActions.length > 0) {
                const actionResult = await executeThreadActions(
                  threadActions,
                  {
                    platform: 'gitlab',
                    projectPath: j.projectPath,
                    mrNumber: j.mrNumber,
                    localPath: j.localPath,
                  },
                  logger,
                  defaultCommandExecutor
                );
                logger.info(
                  { ...actionResult, mrNumber: j.mrNumber },
                  'Thread actions executed for followup'
                );
              }

              // Sync threads from GitLab FIRST to get real state after followup resolves threads
              const mrId = `gitlab-${j.projectPath}-${j.mrNumber}`;
              const updatedMr = syncSingleMrThreads(j.localPath, mrId);

              // Record followup completion with parsed stats
              // Use actual thread counts from GitLab sync, not estimates
              recordReviewCompletion(
                j.localPath,
                mrId,
                {
                  type: 'followup',
                  durationMs: result.durationMs,
                  score: parsed.score,
                  blocking: parsed.blocking,
                  warnings: parsed.warnings,
                  suggestions: parsed.suggestions,
                  // Don't estimate threads - syncSingleMrThreads already updated the real count
                  threadsOpened: 0,
                  threadsClosed: 0,
                }
              );
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
                'Followup stats recorded and threads synced'
              );

              sendNotification('Review followup terminée', `MR !${j.mrNumber} - ${j.projectPath}`, logger);
            } else if (!result.cancelled) {
              sendNotification('Review followup échouée', `MR !${j.mrNumber} - Code ${result.exitCode}`, logger);
              throw new Error(`Followup review failed with exit code ${result.exitCode}`);
            }
          });

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
    logger.warn(
      { projectPath: filterResult.projectPath },
      'Projet non configuré'
    );
    reply.status(200).send({
      status: 'ignored',
      reason: 'Repository not configured',
    });
    return;
  }

  // 5. Track MR assignment with user info
  const mrTitle = event.object_attributes?.title || `MR !${filterResult.mergeRequestNumber}`;
  const assignedBy = {
    username: event.user?.username || 'unknown',
    displayName: event.user?.name,
  };

  trackMrAssignment(
    repoConfig.localPath,
    {
      mrNumber: filterResult.mergeRequestNumber,
      title: mrTitle,
      url: filterResult.mergeRequestUrl,
      project: filterResult.projectPath,
      platform: 'gitlab',
      sourceBranch: filterResult.sourceBranch,
      targetBranch: filterResult.targetBranch,
    },
    assignedBy
  );

  logger.info(
    { mrNumber: filterResult.mergeRequestNumber, assignedBy: assignedBy.username },
    'MR tracked for review'
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
    // MR metadata for dashboard
    title: mrTitle,
    description: event.object_attributes?.description,
    assignedBy,
  };

  const enqueued = await enqueueReview(job, async (j, signal) => {
    // Send start notification
    sendNotification(
      'Review démarrée',
      `MR !${j.mrNumber} - ${j.projectPath}`,
      logger
    );

    // Create review context file with pre-fetched threads
    const mergeRequestId = `gitlab-${j.projectPath}-${j.mrNumber}`;
    const contextGateway = new ReviewContextFileSystemGateway();
    const threadFetchGateway = new GitLabThreadFetchGateway(defaultGitLabExecutor);

    try {
      const threads = threadFetchGateway.fetchThreads(j.projectPath, j.mrNumber);
      contextGateway.create({
        localPath: j.localPath,
        mergeRequestId,
        platform: 'gitlab',
        projectPath: j.projectPath,
        mergeRequestNumber: j.mrNumber,
        threads,
      });
      logger.info(
        { mrNumber: j.mrNumber, threadsCount: threads.length },
        'Review context file created with threads'
      );
    } catch (error) {
      logger.warn(
        { mrNumber: j.mrNumber, error: error instanceof Error ? error.message : String(error) },
        'Failed to create review context file, continuing without it'
      );
    }

    // Invoke Claude with progress tracking and cancellation support
    const result = await invokeClaudeReview(j, logger, (progress, progressEvent) => {
      updateJobProgress(j.id, progress, progressEvent);
    }, signal);

    // Send completion notification and record stats
    if (result.cancelled) {
      sendNotification(
        'Review annulée',
        `MR !${j.mrNumber} - ${j.projectPath}`,
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
            platform: 'gitlab',
            projectPath: j.projectPath,
            mrNumber: j.mrNumber,
            localPath: j.localPath,
          },
          logger,
          defaultCommandExecutor
        );
        logger.info(
          { ...actionResult, mrNumber: j.mrNumber },
          'Thread actions executed for review'
        );
      }

      // Record review completion with parsed stats
      // Only blocking issues count as open threads - warnings are informational
      recordReviewCompletion(
        j.localPath,
        `gitlab-${j.projectPath}-${j.mrNumber}`,
        {
          type: 'review',
          durationMs: result.durationMs,
          score: parsed.score,
          blocking: parsed.blocking,
          warnings: parsed.warnings,
          suggestions: parsed.suggestions,
          threadsOpened: parsed.blocking, // Only blocking issues open threads
        }
      );

      logger.info(
        {
          mrNumber: j.mrNumber,
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
        `MR !${j.mrNumber} - ${j.projectPath}`,
        logger
      );
    } else {
      sendNotification(
        'Review échouée',
        `MR !${j.mrNumber} - Code ${result.exitCode}`,
        logger
      );
      // Throw to mark job as failed (allows retry)
      throw new Error(`Review failed with exit code ${result.exitCode}`);
    }
  });

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
