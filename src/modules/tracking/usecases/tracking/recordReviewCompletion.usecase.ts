import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import { evaluateQualityGate } from '@/modules/tracking/entities/qualityGate/qualityGate.js';
import type { ReviewEvent } from '@/modules/tracking/entities/tracking/reviewEvent.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

interface RecordReviewCompletionInput {
  projectPath: string;
  mrId: string;
  reviewData: {
    type: 'review' | 'followup';
    durationMs: number;
    score: number | null;
    blocking: number;
    warnings: number;
    suggestions?: number;
    threadsOpened?: number;
    threadsClosed?: number;
    diffStats?: DiffStats | null;
  };
  qualityThreshold?: number | null;
}

export class RecordReviewCompletionUseCase implements UseCase<
  RecordReviewCompletionInput,
  TrackedMr | null
> {
  constructor(private readonly trackingGateway: ReviewRequestTrackingGateway) {}

  execute(input: RecordReviewCompletionInput): TrackedMr | null {
    const { projectPath, mrId, reviewData } = input;
    const mr = this.trackingGateway.getById(projectPath, mrId);
    if (!mr) return null;

    const now = new Date().toISOString();
    const suggestions = reviewData.suggestions ?? 0;
    const threadsOpened = reviewData.threadsOpened ?? 0;
    const threadsClosed = reviewData.threadsClosed ?? 0;

    const event: ReviewEvent = {
      type: reviewData.type,
      timestamp: now,
      durationMs: reviewData.durationMs,
      score: reviewData.score,
      blocking: reviewData.blocking,
      warnings: reviewData.warnings,
      suggestions,
      threadsOpened,
      threadsClosed,
      diffStats: reviewData.diffStats ?? null,
    };

    this.trackingGateway.recordReviewEvent(projectPath, mrId, event);

    const afterEvent = this.trackingGateway.getById(projectPath, mrId);
    if (!afterEvent) return null;

    const openThreads = Math.max(0, afterEvent.openThreads + threadsOpened - threadsClosed);
    const totalThreads = afterEvent.totalThreads + threadsOpened;

    let latestScore = afterEvent.latestScore;
    if (reviewData.score !== null) {
      latestScore = reviewData.score;
    }

    const hasBlockingIssues = reviewData.blocking > 0 || openThreads > 0;
    const threshold = input.qualityThreshold ?? null;
    const gateResult = evaluateQualityGate({
      latestScore,
      blockingIssues: reviewData.blocking + openThreads,
      threshold,
    });
    const nextState: TrackedMr['state'] =
      hasBlockingIssues || !gateResult.allowed ? 'pending-fix' : 'pending-approval';

    this.trackingGateway.update(projectPath, mrId, {
      openThreads,
      totalThreads,
      latestScore,
      state: nextState,
      bypass: null,
    });

    return this.trackingGateway.getById(projectPath, mrId);
  }
}
