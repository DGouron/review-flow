import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';

import { cancelReview } from '@/modules/review-execution/usecases/cancelReview.usecase.js';
import type { CancelReviewQueuePort } from '@/modules/review-execution/usecases/cancelReview.usecase.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import { sanitizeJobId } from '@/shared/services/mcpJobContext.js';

import type { ReviewFileGateway } from '../../gateways/reviewFile.gateway.js';

interface ReviewRoutesOptions {
  reviewFileGateway: ReviewFileGateway;
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  getRepositories: () => Array<{ localPath: string; enabled: boolean }>;
  queuePort: CancelReviewQueuePort;
  logger: Logger;
}

const FILENAME_REGEX = /^\d{4}-\d{2}-\d{2}-(?:MR|PR)-[^/\\]+\.md$/;

export const reviewRoutes: FastifyPluginAsync<ReviewRoutesOptions> = async (fastify, opts) => {
  const { reviewFileGateway, reviewRequestTrackingGateway, getRepositories, queuePort, logger } =
    opts;

  fastify.get<{ Querystring: { path?: string } }>('/api/reviews', async (request) => {
    const projectPath = request.query.path?.trim();

    if (projectPath) {
      if (!projectPath.startsWith('/') || projectPath.includes('..')) {
        return { reviews: [], count: 0, error: 'Invalid path' };
      }

      const reviews = await reviewFileGateway.listReviews(projectPath);
      return { reviews, count: reviews.length };
    }

    const allReviews = [];
    for (const repo of getRepositories()) {
      if (!repo.enabled) continue;
      const reviews = await reviewFileGateway.listReviews(repo.localPath);
      allReviews.push(...reviews);
    }

    allReviews.sort((a, b) => b.mtime.localeCompare(a.mtime));
    return { reviews: allReviews, count: allReviews.length };
  });

  fastify.get<{ Params: { filename: string } }>(
    '/api/reviews/:filename',
    async (request, reply) => {
      const { filename } = request.params;

      if (!FILENAME_REGEX.test(filename)) {
        reply.code(400);
        return { error: 'Invalid filename format' };
      }

      for (const repo of getRepositories()) {
        if (!repo.enabled) continue;
        const content = await reviewFileGateway.readReview(repo.localPath, filename);
        if (content !== null) {
          return { filename, content };
        }
      }

      reply.code(404);
      return { error: 'Review not found' };
    },
  );

  fastify.delete<{ Params: { filename: string } }>(
    '/api/reviews/:filename',
    async (request, reply) => {
      const { filename } = request.params;

      if (!FILENAME_REGEX.test(filename)) {
        reply.code(400);
        return { success: false, error: 'Invalid filename format' };
      }

      for (const repo of getRepositories()) {
        if (!repo.enabled) continue;
        const deleted = await reviewFileGateway.deleteReview(repo.localPath, filename);
        if (deleted) {
          return { success: true };
        }
      }

      reply.code(404);
      return { success: false, error: 'Review not found' };
    },
  );

  fastify.post<{
    Params: { jobId: string };
    Body: { projectPath?: string; mrId?: string } | null;
  }>('/api/reviews/cancel/:jobId', async (request, reply) => {
    const { jobId } = request.params;
    const body: { projectPath?: string; mrId?: string } = request.body ?? {};

    if (!jobId || jobId.length === 0) {
      reply.code(400);
      return { success: false, error: 'Job ID requis' };
    }

    const result = cancelReview(jobId, {
      queuePort,
      logger,
    });

    if (result.status === 'cancelled') {
      if (body.projectPath && body.mrId) {
        reviewRequestTrackingGateway.remove(body.projectPath, body.mrId);

        try {
          const contextPath = join(
            homedir(),
            '.claude-review',
            'jobs',
            `${sanitizeJobId(jobId)}.json`,
          );
          if (existsSync(contextPath)) {
            unlinkSync(contextPath);
          }
        } catch {
          logger.warn({ jobId }, 'Failed to delete review context file');
        }
      }

      return { success: true, message: `Job ${jobId} cancelled` };
    }

    if (result.status === 'already-completed') {
      return {
        success: false,
        status: 'already-completed',
        message: 'Cette review est déjà terminée',
      };
    }

    reply.code(404);
    return { success: false, error: 'Job non trouvé' };
  });
};
