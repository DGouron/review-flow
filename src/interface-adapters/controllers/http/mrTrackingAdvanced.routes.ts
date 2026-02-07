import type { FastifyPluginAsync } from 'fastify';
import type { RepositoryConfig } from '../../../config/loader.js';
import { logInfo, logError } from '../../../services/logService.js';
import { enqueueReview, createJobId, updateJobProgress } from '../../../queue/reviewQueue.js';
import { loadProjectConfig, getFollowupAgents } from '../../../config/projectConfig.js';
import { DEFAULT_FOLLOWUP_AGENTS } from '../../../entities/progress/agentDefinition.type.js';
import { invokeClaudeReview, sendNotification } from '../../../claude/invoker.js';
import {
  syncAllThreads,
  syncSingleMrThreads,
  loadMrTracking,
  recordReviewCompletion,
} from '../../../services/mrTrackingService.js';
import { parseReviewOutput } from '../../../services/statsService.js';
import { parseThreadActions } from '../../../services/threadActionsParser.js';
import { executeThreadActions, defaultCommandExecutor } from '../../../services/threadActionsExecutor.js';
import { ReviewContextFileSystemGateway } from '../../gateways/reviewContext.fileSystem.gateway.js';
import { GitHubThreadFetchGateway, defaultGitHubExecutor } from '../../gateways/threadFetch.github.gateway.js';
import { GitLabThreadFetchGateway, defaultGitLabExecutor } from '../../gateways/threadFetch.gitlab.gateway.js';
import { startWatchingReviewContext, stopWatchingReviewContext } from '../../../main/websocket.js';
import type { Logger } from 'pino';

interface MrTrackingAdvancedRoutesOptions {
  getRepositories: () => RepositoryConfig[];
  logger: Logger;
}

function validateProjectPath(path: string | undefined): { valid: false; error: string } | { valid: true; path: string } {
  if (!path) {
    return { valid: false, error: 'projectPath required' };
  }

  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.includes('..')) {
    return { valid: false, error: 'Invalid path' };
  }

  return { valid: true, path: trimmed };
}

export const mrTrackingAdvancedRoutes: FastifyPluginAsync<MrTrackingAdvancedRoutesOptions> = async (
  fastify,
  opts
) => {
  const { getRepositories, logger } = opts;

  fastify.post('/api/mr-tracking/followup', async (request, reply) => {
    const body = request.body as { mrId?: string; projectPath?: string };
    const { mrId, projectPath } = body;

    if (!mrId) {
      reply.code(400);
      return { success: false, error: 'mrId required' };
    }

    const validation = validateProjectPath(projectPath);
    if (!validation.valid) {
      reply.code(400);
      return { success: false, error: validation.error };
    }

    const match = mrId.match(/^(gitlab|github)-(.+)-(\d+)$/);
    if (!match) {
      reply.code(400);
      return { success: false, error: 'Invalid mrId format' };
    }

    const [, platform, , mrNumberStr] = match;
    const mrNumber = Number.parseInt(mrNumberStr, 10);

    const repo = getRepositories().find(
      (r) => r.localPath === validation.path && r.enabled
    );
    if (!repo) {
      reply.code(404);
      return { success: false, error: 'Repository not configured' };
    }

    const projectConfig = loadProjectConfig(validation.path);
    const skill = projectConfig?.reviewFollowupSkill || 'review-followup';

    const gitProjectPath = repo.remoteUrl
      .replace(/^https?:\/\/[^/]+\//, '')
      .replace(/\.git$/, '');

    const jobId = createJobId(`${platform}-followup`, gitProjectPath, mrNumber);

    const mrUrl = platform === 'gitlab'
      ? `${repo.remoteUrl.replace(/\.git$/, '')}/-/merge_requests/${mrNumber}`
      : `${repo.remoteUrl.replace(/\.git$/, '')}/pull/${mrNumber}`;

    const enqueued = await enqueueReview({
      id: jobId,
      platform: platform as 'gitlab' | 'github',
      projectPath: gitProjectPath,
      localPath: repo.localPath,
      mrNumber,
      mrUrl,
      skill,
      sourceBranch: 'unknown',
      targetBranch: 'unknown',
      jobType: 'followup',
    }, async (job, signal) => {
      sendNotification('Review followup started', `MR !${job.mrNumber}`, logger);

      // Create review context file with pre-fetched threads
      const contextGateway = new ReviewContextFileSystemGateway();
      const threadFetchGateway = job.platform === 'github'
        ? new GitHubThreadFetchGateway(defaultGitHubExecutor)
        : new GitLabThreadFetchGateway(defaultGitLabExecutor);

      try {
        const threads = threadFetchGateway.fetchThreads(job.projectPath, job.mrNumber);
        const followupAgentsList = getFollowupAgents(job.localPath) ?? DEFAULT_FOLLOWUP_AGENTS;
        contextGateway.create({
          localPath: job.localPath,
          mergeRequestId: mrId,
          platform: job.platform,
          projectPath: job.projectPath,
          mergeRequestNumber: job.mrNumber,
          threads,
          agents: followupAgentsList,
        });
        logger.info(
          { mrNumber: job.mrNumber, threadsCount: threads.length },
          'Review context file created with threads for manual followup'
        );

        startWatchingReviewContext(job.id, job.localPath, mrId);
        logger.info({ mrNumber: job.mrNumber }, 'Started watching review context for live progress');
      } catch (error) {
        logger.warn(
          { mrNumber: job.mrNumber, error: error instanceof Error ? error.message : String(error) },
          'Failed to create review context file for manual followup, continuing without it'
        );
      }

      const result = await invokeClaudeReview(job, logger, (progress, event) => {
        updateJobProgress(job.id, progress, event);

        // Also update the review context file for file-based progress tracking
        const runningAgent = progress.agents.find(a => a.status === 'running');
        const completedAgents = progress.agents
          .filter(a => a.status === 'completed')
          .map(a => a.name);

        contextGateway.updateProgress(job.localPath, mrId, {
          phase: progress.currentPhase,
          currentStep: runningAgent?.name ?? null,
          stepsCompleted: completedAgents,
        });
      }, signal);

      stopWatchingReviewContext(mrId);

      if (result.success) {
        // Parse review output for stats
        const parsed = parseReviewOutput(result.stdout);

        // Collect thread actions from both sources:
        // 1. MCP actions from review context file (new way)
        // 2. Text markers from stdout (legacy fallback)
        const reviewContext = contextGateway.read(job.localPath, mrId);
        const mcpActions = reviewContext?.actions ?? [];
        const markerActions = parseThreadActions(result.stdout);

        // Combine actions (MCP takes priority, markers as fallback)
        const threadActions = mcpActions.length > 0 ? mcpActions : markerActions;

        let threadResolveCount = 0;
        if (threadActions.length > 0) {
          threadResolveCount = threadActions.filter(a => a.type === 'THREAD_RESOLVE').length;
          logger.info(
            { mcpActionsCount: mcpActions.length, markerActionsCount: markerActions.length, mrNumber: job.mrNumber },
            'Executing thread actions'
          );
          const actionResult = await executeThreadActions(
            threadActions,
            {
              platform: job.platform,
              projectPath: job.projectPath,
              mrNumber: job.mrNumber,
              localPath: job.localPath,
            },
            logger,
            defaultCommandExecutor
          );
          logger.info(
            { ...actionResult, threadResolveCount, mrNumber: job.mrNumber },
            'Thread actions executed for manual followup'
          );
        }

        // Sync threads to get real state after followup resolves threads
        const updatedMr = syncSingleMrThreads(job.localPath, mrId);

        // Record followup completion with parsed stats
        // threadsClosed comes from THREAD_RESOLVE markers parsed from output
        recordReviewCompletion(
          job.localPath,
          mrId,
          {
            type: 'followup',
            durationMs: result.durationMs,
            score: parsed.score,
            blocking: parsed.blocking,
            warnings: parsed.warnings,
            suggestions: parsed.suggestions,
            threadsOpened: 0,
            threadsClosed: threadResolveCount,
          }
        );

        logger.info(
          {
            mrNumber: job.mrNumber,
            score: parsed.score,
            blocking: parsed.blocking,
            openThreads: updatedMr?.openThreads,
            state: updatedMr?.state,
          },
          'Manual followup stats recorded and threads synced'
        );

        sendNotification('Review followup completed', `MR !${job.mrNumber}`, logger);
      } else if (!result.cancelled) {
        sendNotification('Review followup failed', `MR !${job.mrNumber}`, logger);
      }
    });

    if (!enqueued) {
      return { success: false, error: 'Review already in progress or recently performed' };
    }

    logInfo('Followup triggered manually', { mrId, mrNumber, skill });

    return { success: true, jobId, message: 'Followup review in progress' };
  });

  fastify.post('/api/mr-tracking/auto-followup', async (request, reply) => {
    const body = request.body as { mrId?: string; projectPath?: string; enabled?: boolean };
    const { mrId, projectPath, enabled } = body;

    if (!mrId) {
      reply.code(400);
      return { success: false, error: 'mrId requis' };
    }

    if (typeof enabled !== 'boolean') {
      reply.code(400);
      return { success: false, error: 'enabled (boolean) requis' };
    }

    const validation = validateProjectPath(projectPath);
    if (!validation.valid) {
      reply.code(400);
      return { success: false, error: validation.error };
    }

    const { setAutoFollowup } = await import('../../../services/mrTrackingService.js');
    const result = setAutoFollowup(validation.path, mrId, enabled);

    if (!result) {
      reply.code(404);
      return { success: false, error: 'MR non trouvée' };
    }

    logInfo('Auto-followup toggled', { mrId, enabled });
    return { success: true, mr: result };
  });

  fastify.post('/api/mr-tracking/sync', async (request, reply) => {
    const body = request.body as { projectPath?: string; mrId?: string };
    const { projectPath, mrId } = body;

    const validation = validateProjectPath(projectPath);
    if (!validation.valid) {
      reply.code(400);
      return { success: false, error: validation.error };
    }

    try {
      if (mrId) {
        const mr = syncSingleMrThreads(validation.path, mrId);
        if (mr) {
          logInfo('MR/PR synced', { mrId, openThreads: mr.openThreads, state: mr.state });
          return { success: true, mr };
        } else {
          reply.code(404);
          return { success: false, error: 'MR/PR not found' };
        }
      } else {
        await syncAllThreads(validation.path);
        const data = loadMrTracking(validation.path);
        logInfo('All MRs/PRs synced', { count: data.mrs.length });
        return { success: true, mrs: data.mrs };
      }
    } catch (err) {
      const error = err as Error;
      logError('Sync failed', { error: error.message });
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
};
