import type { TrackedMr } from './trackedMr.js';

export interface ProjectStats {
  totalMrs: number;
  totalReviews: number;
  totalFollowups: number;
  averageReviewsPerMr: number;
  averageTimeToApproval: number | null;
  topAssigners: Array<{ username: string; count: number }>;
}

export interface MrTrackingData {
  mrs: TrackedMr[];
  lastUpdated: string;
  stats: ProjectStats;
}

export function createEmptyStats(): ProjectStats {
  return {
    totalMrs: 0,
    totalReviews: 0,
    totalFollowups: 0,
    averageReviewsPerMr: 0,
    averageTimeToApproval: null,
    topAssigners: [],
  };
}
