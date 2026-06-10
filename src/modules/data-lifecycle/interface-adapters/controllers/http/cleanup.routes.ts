import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';

import { getProjectRetentionDays } from '@/config/projectConfig.js';
import type { ReviewLogFileGateway } from '@/modules/data-lifecycle/interface-adapters/gateways/reviewLogFile.gateway.js';
import { cleanupExpiredReviews } from '@/modules/data-lifecycle/usecases/cleanup/cleanupExpiredReviews.usecase.js';
import type { ReviewFileGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewFile.gateway.js';

interface CleanupRoutesOptions {
  reviewFileGateway: ReviewFileGateway;
  reviewLogFileGateway: ReviewLogFileGateway;
  getRepositories: () => Array<{ localPath: string; enabled: boolean }>;
  logger: Logger;
}

export const cleanupRoutes: FastifyPluginAsync<CleanupRoutesOptions> = async (fastify, options) => {
  const { reviewFileGateway, reviewLogFileGateway, getRepositories, logger } = options;

  fastify.post<{ Querystring: { path?: string } }>('/api/reviews/cleanup', async (request) => {
    const singleProjectPath = request.query.path?.trim();

    const allDeletedFiles: string[] = [];
    let totalDeletedCount = 0;

    if (singleProjectPath) {
      const retentionDays = getProjectRetentionDays(singleProjectPath);
      const result = await cleanupExpiredReviews(singleProjectPath, retentionDays, {
        reviewFileGateway,
        reviewLogFileGateway,
      });

      allDeletedFiles.push(...result.deletedReviewFiles, ...result.deletedLogFiles);
      totalDeletedCount += result.totalDeletedCount;
    } else {
      for (const repository of getRepositories()) {
        if (!repository.enabled) continue;

        try {
          const retentionDays = getProjectRetentionDays(repository.localPath);
          const result = await cleanupExpiredReviews(repository.localPath, retentionDays, {
            reviewFileGateway,
            reviewLogFileGateway,
          });

          allDeletedFiles.push(...result.deletedReviewFiles, ...result.deletedLogFiles);
          totalDeletedCount += result.totalDeletedCount;
        } catch (error) {
          logger.error(
            { error, projectPath: repository.localPath },
            'Cleanup failed for repository',
          );
        }
      }
    }

    return {
      success: true,
      deletedCount: totalDeletedCount,
      deletedFiles: allDeletedFiles,
    };
  });
};
