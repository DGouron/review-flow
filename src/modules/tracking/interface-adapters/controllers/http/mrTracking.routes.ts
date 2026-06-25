import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';

import { logInfo, logError } from '@/frameworks/logging/logBuffer.js';
import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import { evaluateQualityGate } from '@/modules/tracking/entities/qualityGate/qualityGate.js';
import type {
  Platform,
  ReviewRequestTrackingGateway,
} from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import { MrDiffStatsPresenter } from '@/modules/tracking/interface-adapters/presenters/mrDiffStats.presenter.js';
import { MarkReviewAsMergedUseCase } from '@/modules/tracking/usecases/tracking/markReviewAsMerged.usecase.js';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import type { RemoveWorktreeAction } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

interface MrTrackingRoutesOptions {
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  getQualityThreshold?: (projectPath: string) => number | null;
  statsGateway?: StatsGateway;
  reviewContextGateway: ReviewContextGateway;
  cancelJob: (jobId: string) => boolean;
  buildJobId: (platform: Platform, projectPath: string, mrNumber: number) => string;
  removeWorktree: RemoveWorktreeAction;
  logger: Logger;
}

function validateProjectPath(
  path: string | undefined,
): { valid: false; error: string } | { valid: true; path: string } {
  if (!path) {
    return { valid: false, error: 'Chemin du projet requis' };
  }

  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.includes('..')) {
    return { valid: false, error: 'Chemin invalide' };
  }

  return { valid: true, path: trimmed };
}

export const mrTrackingRoutes: FastifyPluginAsync<MrTrackingRoutesOptions> = async (
  fastify,
  opts,
) => {
  const {
    reviewRequestTrackingGateway,
    getQualityThreshold,
    statsGateway,
    reviewContextGateway,
    cancelJob,
    buildJobId,
    removeWorktree,
    logger,
  } = opts;
  const mrDiffStatsPresenter = new MrDiffStatsPresenter();

  fastify.get<{ Querystring: { path?: string } }>('/api/mr-tracking', async (request, reply) => {
    const validation = validateProjectPath(request.query.path);

    if (!validation.valid) {
      reply.code(400);
      return { success: false, error: validation.error };
    }

    try {
      const pendingFix = reviewRequestTrackingGateway.getByState(validation.path, 'pending-fix');
      const pendingApproval = reviewRequestTrackingGateway.getByState(
        validation.path,
        'pending-approval',
      );
      const merged = reviewRequestTrackingGateway.getByState(validation.path, 'merged');
      const stats = statsGateway?.loadProjectStats(validation.path) ?? null;
      return {
        success: true,
        pendingFix: mrDiffStatsPresenter.present(pendingFix, stats),
        pendingApproval: mrDiffStatsPresenter.present(pendingApproval, stats),
        merged: mrDiffStatsPresenter.present(merged, stats),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('Erreur lecture MR tracking', { projectPath: validation.path, error: message });
      return { success: false, error: message };
    }
  });

  fastify.post<{ Body: { mrId?: string; projectPath?: string } }>(
    '/api/mr-tracking/approve',
    async (request, reply) => {
      const { mrId, projectPath } = request.body;

      if (!mrId) {
        reply.code(400);
        return { success: false, error: 'mrId requis' };
      }

      const validation = validateProjectPath(projectPath);
      if (!validation.valid) {
        reply.code(400);
        return { success: false, error: validation.error };
      }

      const transitionState = new TransitionStateUseCase(reviewRequestTrackingGateway);
      const threshold = getQualityThreshold?.(validation.path) ?? null;
      const result = transitionState.execute({
        projectPath: validation.path,
        mrId,
        targetState: 'approved',
        qualityCheck: (mr) =>
          evaluateQualityGate({
            latestScore: mr.latestScore,
            blockingIssues: mr.openThreads,
            threshold,
          }),
      });

      if (result.ok) {
        logInfo('MR approuvée', { mrId });
        return { success: true, mrId, message: 'MR marquée comme approuvée' };
      }

      if (result.reason === 'quality-gate') {
        reply.code(409);
        return { success: false, error: result.message };
      }

      reply.code(404);
      return { success: false, error: 'MR non trouvée' };
    },
  );

  fastify.post<{ Body: { mrId?: string; projectPath?: string } }>(
    '/api/mr-tracking/mark-as-merged',
    async (request, reply) => {
      const { mrId, projectPath } = request.body;

      if (!mrId) {
        reply.code(400);
        return { success: false, error: 'mrId requis' };
      }

      const validation = validateProjectPath(projectPath);
      if (!validation.valid) {
        reply.code(400);
        return { success: false, error: validation.error };
      }

      const markReviewAsMerged = new MarkReviewAsMergedUseCase({
        trackingGateway: reviewRequestTrackingGateway,
        reviewContextGateway,
        cancelJob,
        buildJobId,
        removeWorktree,
        logger,
      });
      const result = await markReviewAsMerged.execute({ projectPath: validation.path, mrId });

      if (result.ok) {
        logInfo('MR marquée comme mergée', { mrId });
        return { success: true, mrId, message: 'MR marquée comme mergée' };
      }

      reply.code(404);
      return { success: false, error: 'MR non trouvée' };
    },
  );
};
