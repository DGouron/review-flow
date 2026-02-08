import type { AssignmentInfo } from './assignmentInfo.js';
import type { ReviewEvent } from './reviewEvent.js';

export interface TrackedMr {
  id: string;
  mrNumber: number;
  title: string;
  url: string;
  project: string;
  platform: 'gitlab' | 'github';
  sourceBranch: string;
  targetBranch: string;

  assignment: AssignmentInfo;

  state: 'pending-review' | 'pending-fix' | 'pending-approval' | 'approved' | 'merged' | 'closed';
  openThreads: number;
  totalThreads: number;

  createdAt: string;
  lastReviewAt: string | null;
  lastPushAt: string | null;
  approvedAt: string | null;
  mergedAt: string | null;

  reviews: ReviewEvent[];

  totalReviews: number;
  totalFollowups: number;
  totalBlocking: number;
  totalWarnings: number;
  totalSuggestions: number;
  totalDurationMs: number;
  averageScore: number | null;
  latestScore: number | null;

  autoFollowup: boolean;
}

export function createTrackedMrId(platform: 'gitlab' | 'github', project: string, mrNumber: number): string {
  return `${platform}-${project}-${mrNumber}`;
}
