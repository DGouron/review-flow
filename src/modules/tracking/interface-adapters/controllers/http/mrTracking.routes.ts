import type { FastifyPluginAsync } from 'fastify';

import { logInfo, logError } from '@/frameworks/logging/logBuffer.js';
import { evaluateQualityGate } from '@/modules/tracking/entities/qualityGate/qualityGate.js';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';

import type { ReviewRequestTrackingGateway } from '../../gateways/reviewRequestTracking.gateway.js';

interface MrTrackingRoutesOptions {
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  getQualityThreshold?: (projectPath: string) => number | null;
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
  const { reviewRequestTrackingGateway, getQualityThreshold } = opts;

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
      return {
        success: true,
        pendingFix,
        pendingApproval,
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

      const transitionState = new TransitionStateUseCase(reviewRequestTrackingGateway);
      const result = transitionState.execute({
        projectPath: validation.path,
        mrId,
        targetState: 'merged',
        requireCurrentState: 'pending-fix',
      });

      if (result.ok) {
        logInfo('MR marquée comme mergée', { mrId });
        return { success: true, mrId, message: 'MR marquée comme mergée' };
      }

      switch (result.reason) {
        case 'not-found':
          reply.code(404);
          return { success: false, error: 'MR non trouvée' };
        case 'invalid-current-state':
          reply.code(409);
          return {
            success: false,
            error: 'Seules les MR en correction peuvent être marquées comme mergées',
          };
        case 'quality-gate':
          reply.code(409);
          return { success: false, error: result.message };
        default: {
          const _exhaustive: never = result;
          throw new Error(`Unhandled transition rejection: ${JSON.stringify(_exhaustive)}`);
        }
      }
    },
  );
};
