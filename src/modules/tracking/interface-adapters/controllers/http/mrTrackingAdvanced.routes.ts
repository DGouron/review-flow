import type { FastifyPluginAsync } from 'fastify';
import type { RepositoryConfig } from '@/config/loader.js';
import { logInfo, logError } from '@/frameworks/logging/logBuffer.js';
import { enqueueReview, createJobId, updateJobProgress, type ReviewJob } from '@/frameworks/queue/pQueueAdapter.js';
import type { GateClaudeInvocationUseCase } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import { loadProjectConfig, getFollowupAgents } from '@/config/projectConfig.js';
import { DEFAULT_FOLLOWUP_AGENTS } from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import { invokeClaudeReview, sendNotification } from '@/claude/invoker.js';
import type { ClaudeInvokerDependencies } from '@/frameworks/claude/claudeInvoker.js';
import type { ReviewRequestTrackingGateway } from '../../gateways/reviewRequestTracking.gateway.js';
import type { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import type { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import { parseReviewOutput } from '@/modules/statistics-insights/services/statsService.js';
import { parseThreadActions } from '@/modules/review-execution/services/threadActionsParser.js';
import { executeThreadActions, defaultCommandExecutor } from '@/modules/review-execution/services/threadActionsExecutor.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';
import type { ReviewContextFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewContext.fileSystem.gateway.js';
import type { GitHubThreadFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';
import type { GitLabThreadFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import type { GitLabDiffMetadataFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/diffMetadataFetch.gitlab.gateway.js';
import type { GitHubDiffMetadataFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/diffMetadataFetch.github.gateway.js';
import { startWatchingReviewContext, stopWatchingReviewContext } from '@/main/websocket.js';
import type { GitLabDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.js';
import type { GitHubDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.github.gateway.js';
import type { Logger } from 'pino';
import type { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';
import type { BudgetExceededPayload } from '@/main/websocket.js';

type Platform = 'gitlab' | 'github';

export interface MrTrackingAdvancedRoutesOptions {
  getRepositories: () => RepositoryConfig[];
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  reviewContextGateway: ReviewContextFileSystemGateway;
  threadFetchGatewayFactory: (
    platform: Platform,
  ) => GitHubThreadFetchGateway | GitLabThreadFetchGateway;
  diffMetadataFetchGatewayFactory: (
    platform: Platform,
  ) => GitHubDiffMetadataFetchGateway | GitLabDiffMetadataFetchGateway;
  diffStatsFetchGatewayFactory: (
    platform: Platform,
  ) => GitHubDiffStatsFetchGateway | GitLabDiffStatsFetchGateway;
  createSyncThreadsUseCase: (platform: Platform) => SyncThreadsUseCase;
  recordReviewCompletion: RecordReviewCompletionUseCase;
  enforceBudget: Pick<EnforceBudgetUseCase, 'execute'>;
  broadcastBudgetExceeded: (payload: BudgetExceededPayload) => void;
  claudeInvokerDeps?: ClaudeInvokerDependencies;
  gateClaudeInvocation?: GateClaudeInvocationUseCase;
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
  const {
    getRepositories,
    reviewRequestTrackingGateway,
    reviewContextGateway: contextGateway,
    threadFetchGatewayFactory,
    diffMetadataFetchGatewayFactory,
    diffStatsFetchGatewayFactory,
    createSyncThreadsUseCase,
    recordReviewCompletion,
    enforceBudget,
    broadcastBudgetExceeded,
    claudeInvokerDeps,
    gateClaudeInvocation,
    logger,
  } = opts;

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
    const platformLiteral: Platform = platform === 'github' ? 'github' : 'gitlab';

    const repo = getRepositories().find(
      (r) => r.localPath === validation.path && r.enabled
    );
    if (!repo) {
      reply.code(404);
      return { success: false, error: 'Repository not configured' };
    }

    const trackedMr = reviewRequestTrackingGateway.getByNumber(
      validation.path,
      mrNumber,
      platformLiteral,
    );
    if (!trackedMr) {
      reply.code(404);
      return { success: false, error: 'MR not tracked' };
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

    const budgetDecision = await enforceBudget.execute({
      localPaths: getRepositories()
        .filter((repository) => repository.enabled)
        .map((repository) => repository.localPath),
    });
    if (!budgetDecision.accepted) {
      logger.warn(
        {
          mrNumber,
          limitUsd: budgetDecision.status.limitUsd,
          consumedUsd: budgetDecision.status.consumedUsd,
        },
        'Budget exceeded, manual followup not enqueued'
      );
      broadcastBudgetExceeded({
        mrNumber,
        platform: platformLiteral,
        projectPath: gitProjectPath,
        limitUsd: budgetDecision.status.limitUsd,
        consumedUsd: budgetDecision.status.consumedUsd,
      });
      reply.code(200);
      return { status: 'rejected', reason: 'budget-exceeded' };
    }

    const manualFollowupJob: ReviewJob = {
      id: jobId,
      platform: platformLiteral,
      projectPath: gitProjectPath,
      localPath: repo.localPath,
      mrNumber,
      mrUrl,
      skill,
      sourceBranch: trackedMr.sourceBranch,
      targetBranch: trackedMr.targetBranch,
      jobType: 'followup',
    };

    const manualFollowupProcessor = async (job: ReviewJob, signal: AbortSignal): Promise<void> => {
      sendNotification('Review followup started', `MR !${job.mrNumber}`, logger);

      // Use injected gateways to fetch threads + diff metadata.
      const threadFetchGateway = threadFetchGatewayFactory(job.platform);
      const diffMetadataFetchGateway = diffMetadataFetchGatewayFactory(job.platform);

      try {
        const threads = threadFetchGateway.fetchThreads(job.projectPath, job.mrNumber);
        let diffMetadata: import('@/modules/review-execution/entities/reviewContext/reviewContext.js').DiffMetadata | undefined;
        try {
          diffMetadata = diffMetadataFetchGateway.fetchDiffMetadata(job.projectPath, job.mrNumber);
        } catch (error) {
          logger.warn(
            { mrNumber: job.mrNumber, error: error instanceof Error ? error.message : String(error) },
            'Failed to fetch diff metadata for followup, inline comments will be skipped'
          );
        }
        const followupAgentsList = getFollowupAgents(job.localPath) ?? DEFAULT_FOLLOWUP_AGENTS;
        contextGateway.create({
          localPath: job.localPath,
          mergeRequestId: mrId,
          platform: job.platform,
          projectPath: job.projectPath,
          mergeRequestNumber: job.mrNumber,
          threads,
          agents: followupAgentsList,
          diffMetadata,
        });
        logger.info(
          { mrNumber: job.mrNumber, threadsCount: threads.length, hasDiffMetadata: !!diffMetadata },
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
      }, signal, claudeInvokerDeps);

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

        let threadResolveCount = 0;
        if (reviewContext && mcpActions.length > 0) {
          // Primary path: MCP actions execute against the authenticated context inventory,
          // which re-admits THREAD_RESOLVE for threads owned by this MR (forged ids stay dropped).
          threadResolveCount = mcpActions.filter(a => a.type === 'THREAD_RESOLVE').length;
          logger.info(
            { mcpActionsCount: mcpActions.length, mrNumber: job.mrNumber },
            'Executing thread actions'
          );
          const actionResult = await executeActionsFromContext(
            reviewContext,
            job.localPath,
            logger,
            defaultCommandExecutor
          );
          logger.info(
            { ...actionResult, threadResolveCount, mrNumber: job.mrNumber },
            'Thread actions executed for manual followup'
          );
        } else if (markerActions.length > 0) {
          // Legacy fallback: stdout markers carry no authenticated inventory, so resolves stay dropped.
          threadResolveCount = markerActions.filter(a => a.type === 'THREAD_RESOLVE').length;
          logger.info(
            { markerActionsCount: markerActions.length, mrNumber: job.mrNumber },
            'Executing thread actions'
          );
          const actionResult = await executeThreadActions(
            markerActions,
            {
              platform: job.platform,
              projectPath: job.projectPath,
              mrNumber: job.mrNumber,
              localPath: job.localPath,
              diffMetadata: reviewContext?.diffMetadata,
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
        const syncUseCase = createSyncThreadsUseCase(job.platform);
        const updatedMr = syncUseCase.execute({ projectPath: job.localPath, mrId });

        let diffStats = null;
        try {
          diffStats = diffStatsFetchGatewayFactory(job.platform).fetchDiffStats(
            job.projectPath,
            job.mrNumber,
          );
        } catch {
          logger.warn({ mrNumber: job.mrNumber }, 'Failed to fetch diff stats for manual followup');
        }

        recordReviewCompletion.execute({
          projectPath: job.localPath,
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
            diffStats,
          },
          qualityThreshold: loadProjectConfig(job.localPath)?.qualityThreshold ?? null,
        });

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
    };

    if (gateClaudeInvocation) {
      const gateResult = await gateClaudeInvocation.execute({
        job: manualFollowupJob,
        triggerSource: 'dashboard-manual',
        processor: manualFollowupProcessor,
      });
      if (gateResult.status === 'pending') {
        logInfo('Manual followup parked for human confirmation', { mrId, mrNumber, pendingId: gateResult.pendingId });
        return { success: true, status: 'pending-confirmation', pendingId: gateResult.pendingId };
      }
      if (gateResult.status === 'rejected') {
        return { success: false, error: 'Review already in progress or recently performed' };
      }
      logInfo('Followup triggered manually', { mrId, mrNumber, skill });
      return { success: true, jobId, message: 'Followup review in progress' };
    }

    const enqueued = await enqueueReview(manualFollowupJob, manualFollowupProcessor);

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

    reviewRequestTrackingGateway.update(validation.path, mrId, { autoFollowup: enabled });
    const result = reviewRequestTrackingGateway.getById(validation.path, mrId);

    if (!result) {
      reply.code(404);
      return { success: false, error: 'MR non trouvée' };
    }

    logInfo('Auto-followup toggled', { mrId, enabled });
    return { success: true, mr: result };
  });

  fastify.post('/api/mr-tracking/followup-importants', async (request, reply) => {
    const body = request.body as { projectPath?: string };

    let repos: RepositoryConfig[];
    if (body.projectPath) {
      const validation = validateProjectPath(body.projectPath);
      if (!validation.valid) {
        reply.code(400);
        return { success: false, error: validation.error };
      }
      const repo = getRepositories().find(r => r.localPath === validation.path && r.enabled);
      if (!repo) {
        reply.code(404);
        return { success: false, error: 'Repository not configured' };
      }
      repos = [repo];
    } else {
      repos = getRepositories().filter(r => r.enabled);
    }

    const candidates: Array<{ mr: import('@/modules/tracking/entities/tracking/trackedMr.js').TrackedMr; projectPath: string }> = [];
    for (const repo of repos) {
      const mrs = reviewRequestTrackingGateway.getByState(repo.localPath, 'pending-approval');
      for (const mr of mrs) {
        if (mr.totalWarnings > 0) {
          candidates.push({ mr, projectPath: repo.localPath });
        }
      }
    }

    if (candidates.length === 0) {
      return { success: true, triggered: 0, candidates: [], failed: [] };
    }

    const failed: Array<{ mrId: string; error: string }> = [];
    let triggered = 0;

    for (const { mr, projectPath } of candidates) {
      try {
        const internalResponse = await fastify.inject({
          method: 'POST',
          url: '/api/mr-tracking/followup',
          payload: { mrId: mr.id, projectPath },
        });
        const data = JSON.parse(internalResponse.body);
        if (data.success) {
          triggered++;
        } else {
          failed.push({ mrId: mr.id, error: data.error });
        }
      } catch (error) {
        failed.push({ mrId: mr.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    logInfo('Followup importants batch triggered', { triggered, failed: failed.length, total: candidates.length });

    return {
      success: true,
      triggered,
      candidates: candidates.map(c => ({ mrId: c.mr.id, mrNumber: c.mr.mrNumber, title: c.mr.title })),
      failed,
    };
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
        const mrData = reviewRequestTrackingGateway.getById(validation.path, mrId);
        if (!mrData) {
          reply.code(404);
          return { success: false, error: 'MR/PR not found' };
        }
        const syncUseCase = createSyncThreadsUseCase(mrData.platform);
        const mr = syncUseCase.execute({ projectPath: validation.path, mrId });
        if (mr) {
          logInfo('MR/PR synced', { mrId, openThreads: mr.openThreads, state: mr.state });
          return { success: true, mr };
        }
        reply.code(404);
        return { success: false, error: 'MR/PR not found' };
      }

      const activeMrs = reviewRequestTrackingGateway.getActiveMrs(validation.path);
      for (const activeMr of activeMrs) {
        try {
          const syncUseCase = createSyncThreadsUseCase(activeMr.platform);
          syncUseCase.execute({ projectPath: validation.path, mrId: activeMr.id });
        } catch {
          // Ignore individual MR sync failures
        }
      }
      const data = reviewRequestTrackingGateway.loadTracking(validation.path);
      const mrs = data?.mrs ?? [];
      logInfo('All MRs/PRs synced', { count: mrs.length });
      return { success: true, mrs };
    } catch (err) {
      const error = err as Error;
      logError('Sync failed', { error: error.message });
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
};
