import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { verifyGitHubSignature, getGitHubEventType } from '../security/verifier.js';
import { filterGitHubEvent, type GitHubPullRequestEvent } from './eventFilter.js';
import { findRepositoryByRemoteUrl } from '../config/loader.js';
import {
  enqueueReview,
  createJobId,
  type ReviewJob,
} from '../queue/reviewQueue.js';
import { invokeClaudeReview, sendNotification } from '../claude/invoker.js';

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

  // 3. Parse and filter event
  const event = request.body as GitHubPullRequestEvent;
  const filterResult = filterGitHubEvent(event);

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

  // 5. Create and enqueue job
  const jobId = createJobId('github', filterResult.projectPath!, filterResult.mrNumber!);
  const job: ReviewJob = {
    id: jobId,
    platform: 'github',
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
      `PR #${j.mrNumber} - ${j.projectPath}`,
      logger
    );

    // Invoke Claude
    const result = await invokeClaudeReview(j, logger);

    // Send completion notification
    if (result.success) {
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
      prNumber: filterResult.mrNumber,
    });
  } else {
    reply.status(200).send({
      status: 'deduplicated',
      jobId,
      reason: 'Review already in progress or recently completed',
    });
  }
}
