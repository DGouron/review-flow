import type { FastifyPluginAsync } from 'fastify';
import type { ReviewFileGateway } from '../interface-adapters/gateways/reviewFile.gateway.js';
import { cancelJob } from '../queue/reviewQueue.js';

interface ReviewRoutesOptions {
  reviewFileGateway: ReviewFileGateway;
  getRepositories: () => Array<{ localPath: string; enabled: boolean }>;
}

const FILENAME_REGEX = /^\d{4}-\d{2}-\d{2}-MR-[^/\\]+\.md$/;

export const reviewRoutes: FastifyPluginAsync<ReviewRoutesOptions> = async (
  fastify,
  opts
) => {
  const { reviewFileGateway, getRepositories } = opts;

  fastify.get('/api/reviews', async (request) => {
    const query = request.query as { path?: string };
    const projectPath = query.path?.trim();

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

  fastify.get('/api/reviews/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };

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
  });

  fastify.delete('/api/reviews/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };

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
  });

  fastify.post('/api/reviews/cancel/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    if (!jobId || jobId.length === 0) {
      reply.code(400);
      return { success: false, error: 'Job ID required' };
    }

    const cancelled = cancelJob(jobId);
    if (cancelled) {
      return { success: true, message: `Job ${jobId} cancelled` };
    }

    reply.code(404);
    return { success: false, error: 'Job not found or already completed' };
  });
};
