import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { verifyGitLabSignature, getGitLabEventType } from '../security/verifier.js';
import { filterGitLabEvent, type GitLabMergeRequestEvent } from './eventFilter.js';
import { findRepositoryByProjectPath } from '../config/loader.js';
import {
  enqueueReview,
  createJobId,
  type ReviewJob,
} from '../queue/reviewQueue.js';
import { invokeClaudeReview, sendNotification } from '../claude/invoker.js';

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

  // 3. Parse and filter event
  const event = request.body as GitLabMergeRequestEvent;
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
    reply.status(200).send({ status: 'ignored', reason: filterResult.reason });
    return;
  }

  // 4. Find repository configuration
  const repoConfig = findRepositoryByProjectPath(filterResult.projectPath!);
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

  // 5. Create and enqueue job
  const jobId = createJobId('gitlab', filterResult.projectPath!, filterResult.mrNumber!);
  const job: ReviewJob = {
    id: jobId,
    platform: 'gitlab',
    projectPath: filterResult.projectPath!,
    localPath: repoConfig.localPath,
    mrNumber: filterResult.mrNumber!,
    skill: repoConfig.skill,
    mrUrl: filterResult.mrUrl!,
    sourceBranch: filterResult.sourceBranch!,
    targetBranch: filterResult.targetBranch!,
  };

  const enqueued = await enqueueReview(job, async (j) => {
    // Send start notification
    sendNotification(
      'Review démarrée',
      `MR !${j.mrNumber} - ${j.projectPath}`,
      logger
    );

    // Invoke Claude
    const result = await invokeClaudeReview(j, logger);

    // Send completion notification
    if (result.success) {
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
    }
  });

  if (enqueued) {
    reply.status(202).send({
      status: 'queued',
      jobId,
      mrNumber: filterResult.mrNumber,
    });
  } else {
    reply.status(200).send({
      status: 'deduplicated',
      jobId,
      reason: 'Review already in progress or recently completed',
    });
  }
}
