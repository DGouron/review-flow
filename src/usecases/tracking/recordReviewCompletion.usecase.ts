import type { UseCase } from '../../shared/foundation/usecase.base.js';
import type { ReviewRequestTrackingGateway } from '../../interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '../../entities/tracking/trackedMr.js';
import type { ReviewEvent } from '../../entities/tracking/reviewEvent.js';

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
  };
}

export class RecordReviewCompletionUseCase implements UseCase<RecordReviewCompletionInput, TrackedMr | null> {
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

    const reviewsWithScore = afterEvent.reviews.filter((r) => r.score !== null);
    let averageScore: number | null = null;
    if (reviewsWithScore.length > 0) {
      averageScore = reviewsWithScore.reduce((sum, r) => sum + (r.score ?? 0), 0) / reviewsWithScore.length;
    }

    const hasBlockingIssues = reviewData.blocking > 0 || openThreads > 0;

    this.trackingGateway.update(projectPath, mrId, {
      openThreads,
      totalThreads,
      latestScore,
      averageScore,
      state: hasBlockingIssues ? 'pending-fix' : 'pending-approval',
    });

    return this.trackingGateway.getById(projectPath, mrId);
  }
}
