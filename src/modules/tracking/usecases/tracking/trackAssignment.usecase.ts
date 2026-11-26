import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type {
  MergeRequestAuthor,
  TrackedMr,
} from '@/modules/tracking/entities/tracking/trackedMr.js';
import { createTrackedMrId } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

interface TrackAssignmentInput {
  projectPath: string;
  mrInfo: {
    mrNumber: number;
    title: string;
    url: string;
    project: string;
    platform: 'gitlab' | 'github';
    sourceBranch: string;
    targetBranch: string;
  };
  assignedBy: {
    username: string;
    displayName?: string;
  };
  author: MergeRequestAuthor | null;
}

export class TrackAssignmentUseCase implements UseCase<TrackAssignmentInput, TrackedMr> {
  constructor(private readonly trackingGateway: ReviewRequestTrackingGateway) {}

  execute(input: TrackAssignmentInput): TrackedMr {
    const { projectPath, mrInfo, assignedBy, author } = input;
    const mrId = createTrackedMrId(mrInfo.platform, mrInfo.project, mrInfo.mrNumber);
    const existing = this.trackingGateway.getById(projectPath, mrId);

    if (existing) {
      return this.updateExisting(projectPath, existing, mrInfo, assignedBy, author);
    }

    return this.createNew(projectPath, mrId, mrInfo, assignedBy, author);
  }

  private updateExisting(
    projectPath: string,
    existing: TrackedMr,
    mrInfo: TrackAssignmentInput['mrInfo'],
    assignedBy: TrackAssignmentInput['assignedBy'],
    author: MergeRequestAuthor | null,
  ): TrackedMr {
    const now = new Date().toISOString();
    const shouldResetState = existing.state === 'merged' || existing.state === 'closed';

    this.trackingGateway.update(projectPath, existing.id, {
      title: mrInfo.title,
      assignment: {
        username: assignedBy.username,
        displayName: assignedBy.displayName,
        assignedAt: now,
      },
      author: author ?? existing.author ?? null,
      ...(shouldResetState ? { state: 'pending-review' } : {}),
    });

    return this.trackingGateway.getById(projectPath, existing.id) ?? existing;
  }

  private createNew(
    projectPath: string,
    mrId: string,
    mrInfo: TrackAssignmentInput['mrInfo'],
    assignedBy: TrackAssignmentInput['assignedBy'],
    author: MergeRequestAuthor | null,
  ): TrackedMr {
    const now = new Date().toISOString();
    const trackedMr: TrackedMr = {
      id: mrId,
      mrNumber: mrInfo.mrNumber,
      title: mrInfo.title,
      url: mrInfo.url,
      project: mrInfo.project,
      platform: mrInfo.platform,
      sourceBranch: mrInfo.sourceBranch,
      targetBranch: mrInfo.targetBranch,
      assignment: {
        username: assignedBy.username,
        displayName: assignedBy.displayName,
        assignedAt: now,
      },
      author,
      state: 'pending-review',
      openThreads: 0,
      totalThreads: 0,
      createdAt: now,
      lastReviewAt: null,
      lastPushAt: null,
      approvedAt: null,
      mergedAt: null,
      reviews: [],
      totalReviews: 0,
      totalFollowups: 0,
      totalBlocking: 0,
      totalWarnings: 0,
      totalSuggestions: 0,
      totalDurationMs: 0,
      autoFollowup: true,
      bypass: null,
      sizeBlock: null,
    };

    this.trackingGateway.create(projectPath, trackedMr);
    return trackedMr;
  }
}
