import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';

import { loadProjectConfig } from '@/config/projectConfig.js';
import { createJobId } from '@/frameworks/queue/pQueueAdapter.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type {
  SizeBlockEntry,
  SizeBlockListPresenter,
} from '@/modules/tracking/interface-adapters/presenters/sizeBlockList.presenter.js';
import type { ForceLaunchBlockedReviewUseCase } from '@/modules/tracking/usecases/tracking/forceLaunchBlockedReview.usecase.js';

type ReviewProcessor = (job: ReviewJob, signal: AbortSignal) => Promise<void>;

export interface SizeBlocksRoutesOptions {
  getRepositories: () => RepositoryConfig[];
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  sizeBlockListPresenter: SizeBlockListPresenter;
  forceLaunchBlockedReview: ForceLaunchBlockedReviewUseCase;
  resolveReviewProcessor: (job: ReviewJob) => ReviewProcessor;
  logger: Logger;
}

function validateProjectPath(
  path: string | undefined,
): { valid: false; error: string } | { valid: true; path: string } {
  if (!path) {
    return { valid: false, error: 'projectPath required' };
  }
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.includes('..')) {
    return { valid: false, error: 'Invalid path' };
  }
  return { valid: true, path: trimmed };
}

function toGitProjectPath(remoteUrl: string): string {
  return remoteUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '');
}

function toMergeRequestUrl(remoteUrl: string, platform: string, mrNumber: number): string {
  const base = remoteUrl.replace(/\.git$/, '');
  return platform === 'gitlab'
    ? `${base}/-/merge_requests/${mrNumber}`
    : `${base}/pull/${mrNumber}`;
}

export const sizeBlocksRoutes: FastifyPluginAsync<SizeBlocksRoutesOptions> = async (
  fastify,
  options,
) => {
  const {
    getRepositories,
    reviewRequestTrackingGateway,
    sizeBlockListPresenter,
    forceLaunchBlockedReview,
    resolveReviewProcessor,
    logger,
  } = options;

  fastify.get('/api/size-blocks', async () => {
    const entries: SizeBlockEntry[] = [];
    for (const repository of getRepositories().filter((repo) => repo.enabled)) {
      const tracking = reviewRequestTrackingGateway.loadTracking(repository.localPath);
      if (!tracking) continue;
      for (const mr of tracking.mrs) {
        if (mr.sizeBlock !== null) {
          entries.push({
            mr,
            projectName: repository.name,
            projectPath: repository.localPath,
          });
        }
      }
    }
    return sizeBlockListPresenter.present({ entries });
  });

  fastify.post<{ Body: { mrId?: string; projectPath?: string } }>(
    '/api/mr-tracking/force-start',
    async (request, reply) => {
      const { mrId, projectPath } = request.body;

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

      const repository = getRepositories().find(
        (repo) => repo.localPath === validation.path && repo.enabled,
      );
      if (!repository) {
        reply.code(404);
        return { success: false, error: 'Repository not configured' };
      }

      const trackedMr = reviewRequestTrackingGateway.getById(validation.path, mrId);
      if (!trackedMr) {
        reply.code(404);
        return { success: false, error: 'MR not tracked' };
      }

      const reviewSkill = loadProjectConfig(validation.path)?.reviewSkill ?? 'review';
      const gitProjectPath = toGitProjectPath(repository.remoteUrl);

      const job: ReviewJob = {
        id: createJobId(platform, gitProjectPath, mrNumber),
        platform: repository.platform,
        projectPath: gitProjectPath,
        localPath: repository.localPath,
        mrNumber,
        skill: reviewSkill,
        mrUrl: toMergeRequestUrl(repository.remoteUrl, platform, mrNumber),
        sourceBranch: trackedMr.sourceBranch,
        targetBranch: trackedMr.targetBranch,
        jobType: 'review',
        title: trackedMr.title,
      };

      const result = await forceLaunchBlockedReview.execute({
        projectPath: validation.path,
        mrId,
        job,
        processor: resolveReviewProcessor(job),
      });

      if (result === 'launched') {
        logger.info({ mrId, mrNumber }, 'Oversized MR force-launched from dashboard');
        return { success: true, jobId: job.id };
      }
      if (result === 'rejected-duplicate') {
        reply.code(409);
        return { success: false, error: 'Une review est déjà en cours pour cette merge request' };
      }
      if (result === 'not-blocked') {
        return { success: true, alreadyCleared: true };
      }
      reply.code(404);
      return { success: false, error: 'MR not tracked' };
    },
  );
};
