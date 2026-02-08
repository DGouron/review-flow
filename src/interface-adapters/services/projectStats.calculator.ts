import type { TrackedMr } from '../../entities/tracking/trackedMr.js';
import type { ProjectStats } from '../../entities/tracking/mrTrackingData.js';

export class ProjectStatsCalculator {
  compute(mrs: TrackedMr[]): ProjectStats {
    if (mrs.length === 0) {
      return {
        totalMrs: 0,
        totalReviews: 0,
        totalFollowups: 0,
        averageReviewsPerMr: 0,
        averageTimeToApproval: null,
        topAssigners: [],
      };
    }

    const totalReviews = mrs.reduce((sum, mr) => sum + mr.totalReviews, 0);
    const totalFollowups = mrs.reduce((sum, mr) => sum + mr.totalFollowups, 0);
    const averageReviewsPerMr = (totalReviews + totalFollowups) / mrs.length;

    const averageTimeToApproval = this.computeAverageTimeToApproval(mrs);
    const topAssigners = this.computeTopAssigners(mrs);

    return {
      totalMrs: mrs.length,
      totalReviews,
      totalFollowups,
      averageReviewsPerMr,
      averageTimeToApproval,
      topAssigners,
    };
  }

  private computeAverageTimeToApproval(mrs: TrackedMr[]): number | null {
    const approvedMrs = mrs.filter((mr) => mr.approvedAt && mr.createdAt);
    if (approvedMrs.length === 0) return null;

    const totalTime = approvedMrs.reduce((sum, mr) => {
      if (!mr.approvedAt) return sum;
      const created = new Date(mr.createdAt).getTime();
      const approved = new Date(mr.approvedAt).getTime();
      return sum + (approved - created);
    }, 0);

    return totalTime / approvedMrs.length;
  }

  private computeTopAssigners(mrs: TrackedMr[]): Array<{ username: string; count: number }> {
    const assignerCounts = new Map<string, number>();

    for (const mr of mrs) {
      const username = mr.assignment.username;
      assignerCounts.set(username, (assignerCounts.get(username) ?? 0) + 1);
    }

    return Array.from(assignerCounts.entries())
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }
}
