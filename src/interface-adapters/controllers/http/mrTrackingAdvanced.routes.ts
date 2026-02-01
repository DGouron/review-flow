import type { FastifyPluginAsync } from 'fastify';
import type { RepositoryConfig } from '../../../config/loader.js';
import { logInfo, logError } from '../../../services/logService.js';
import { enqueueReview, createJobId, updateJobProgress } from '../../../queue/reviewQueue.js';
import { loadProjectConfig } from '../../../config/projectConfig.js';
import { invokeClaudeReview, sendNotification } from '../../../claude/invoker.js';
import {
  syncAllThreads,
  syncSingleMrThreads,
  loadMrTracking,
} from '../../../services/mrTrackingService.js';
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
    const mrNumber = parseInt(mrNumberStr, 10);

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
    }, async (job, signal) => {
      sendNotification('Review followup started', `MR !${job.mrNumber}`, logger);

      const result = await invokeClaudeReview(job, logger, (progress, event) => {
        updateJobProgress(job.id, progress, event);
      }, signal);

      if (result.success) {
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
