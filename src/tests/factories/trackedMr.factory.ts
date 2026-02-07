import type { TrackedMr, MrTrackingData } from '../../services/mrTrackingService.js';

export class TrackedMrFactory {
  static create(overrides: Partial<TrackedMr> = {}): TrackedMr {
    return {
      id: 'mr-1',
      mrNumber: 42,
      title: 'Fix bug',
      url: 'https://gitlab.com/project/-/merge_requests/42',
      project: 'my/project',
      platform: 'gitlab',
      sourceBranch: 'fix-bug',
      targetBranch: 'main',
      assignment: { username: 'claude', assignedAt: '2024-01-15T10:00:00Z' },
      state: 'pending-review',
      openThreads: 0,
      totalThreads: 0,
      createdAt: '2024-01-15T10:00:00Z',
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
      averageScore: null,
      latestScore: null,
      autoFollowup: true,
      ...overrides,
    };
  }
}

export class MrTrackingDataFactory {
  static create(overrides: Partial<MrTrackingData> = {}): MrTrackingData {
    return {
      mrs: [],
      lastUpdated: '2024-01-15T10:00:00Z',
      stats: {
        totalMrs: 0,
        totalReviews: 0,
        totalFollowups: 0,
        averageReviewsPerMr: 0,
        averageTimeToApproval: null,
        topAssigners: [],
      },
      ...overrides,
    };
  }

  static withMrs(mrs: TrackedMr[]): MrTrackingData {
    return this.create({
      mrs,
      stats: {
        totalMrs: mrs.length,
        totalReviews: 0,
        totalFollowups: 0,
        averageReviewsPerMr: 0,
        averageTimeToApproval: null,
        topAssigners: [],
      },
    });
  }
}
