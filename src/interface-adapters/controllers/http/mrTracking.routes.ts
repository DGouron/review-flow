import type { FastifyPluginAsync } from 'fastify';
import type { ReviewRequestTrackingGateway } from '../../gateways/reviewRequestTracking.gateway.js';
import { TransitionStateUseCase } from '../../../usecases/tracking/transitionState.usecase.js';
import { logInfo, logError } from '../../../frameworks/logging/logBuffer.js';

interface MrTrackingRoutesOptions {
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
}

function validateProjectPath(path: string | undefined): { valid: false; error: string } | { valid: true; path: string } {
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
  opts
) => {
  const { reviewRequestTrackingGateway } = opts;

  fastify.get('/api/mr-tracking', async (request, reply) => {
    const query = request.query as { path?: string };
    const validation = validateProjectPath(query.path);

    if (!validation.valid) {
      reply.code(400);
      return { success: false, error: validation.error };
    }

    try {
      const pendingFix = reviewRequestTrackingGateway.getByState(validation.path, 'pending-fix');
      const pendingApproval = reviewRequestTrackingGateway.getByState(validation.path, 'pending-approval');
      return {
        success: true,
        pendingFix,
        pendingApproval,
      };
    } catch (error) {
      const err = error as Error;
      logError('Erreur lecture MR tracking', { projectPath: validation.path, error: err.message });
      return { success: false, error: err.message };
    }
  });

  fastify.post('/api/mr-tracking/approve', async (request, reply) => {
    const body = request.body as { mrId?: string; projectPath?: string };
    const { mrId, projectPath } = body;

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
    const approved = transitionState.execute({
      projectPath: validation.path,
      mrId,
      targetState: 'approved',
    });

    if (approved) {
      logInfo('MR approuvée', { mrId });
      return { success: true, mrId, message: 'MR marquée comme approuvée' };
    }

    reply.code(404);
    return { success: false, error: 'MR non trouvée' };
  });
};
