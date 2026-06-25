import type { Logger } from 'pino';

import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type {
  Platform,
  ReviewRequestTrackingGateway,
} from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { RemoveWorktreeAction } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface MarkReviewAsMergedInput {
  projectPath: string;
  mrId: string;
}

export type MarkReviewAsMergedResult =
  | { ok: true; jobCancelled: boolean; contextReleased: boolean; recordRetained: true }
  | { ok: false; reason: 'not-found' };

export interface MarkReviewAsMergedDependencies {
  trackingGateway: Pick<ReviewRequestTrackingGateway, 'getById' | 'update'>;
  reviewContextGateway: Pick<ReviewContextGateway, 'delete'>;
  cancelJob: (jobId: string) => boolean;
  buildJobId: (platform: Platform, projectPath: string, mrNumber: number) => string;
  removeWorktree: RemoveWorktreeAction;
  logger: Logger;
}

export class MarkReviewAsMergedUseCase implements UseCase<
  MarkReviewAsMergedInput,
  Promise<MarkReviewAsMergedResult>
> {
  constructor(private readonly deps: MarkReviewAsMergedDependencies) {}

  async execute(input: MarkReviewAsMergedInput): Promise<MarkReviewAsMergedResult> {
    const { projectPath, mrId } = input;
    const mr = this.deps.trackingGateway.getById(projectPath, mrId);
    if (!mr) return { ok: false, reason: 'not-found' };

    if (mr.state === 'merged') {
      return { ok: true, jobCancelled: false, contextReleased: false, recordRetained: true };
    }

    const jobCancelled = this.deps.cancelJob(
      this.deps.buildJobId(mr.platform, projectPath, mr.mrNumber),
    );
    const contextReleased = this.deps.reviewContextGateway.delete(projectPath, mrId).deleted;
    await this.removeWorktreeBestEffort(mr, projectPath);

    this.deps.trackingGateway.update(projectPath, mrId, {
      state: 'merged',
      mergedAt: new Date().toISOString(),
    });

    return { ok: true, jobCancelled, contextReleased, recordRetained: true };
  }

  private async removeWorktreeBestEffort(mr: TrackedMr, projectPath: string): Promise<void> {
    try {
      const removal = await this.deps.removeWorktree({
        identity: { platform: mr.platform, projectPath, mrNumber: mr.mrNumber },
        sourceCheckoutPath: projectPath,
      });
      if (removal.status === 'failed') {
        this.deps.logger.warn(
          { projectPath, mrNumber: mr.mrNumber, warning: removal.warning },
          'removeWorktree failed on mark-as-merged',
        );
      }
    } catch (error) {
      this.deps.logger.warn(
        {
          projectPath,
          mrNumber: mr.mrNumber,
          error: error instanceof Error ? error.message : String(error),
        },
        'removeWorktree threw on mark-as-merged',
      );
    }
  }
}
