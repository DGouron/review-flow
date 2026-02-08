import type {
  ReviewRequestTrackingGateway,
  Platform,
} from '../../interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { MrTrackingData } from '../../entities/tracking/mrTrackingData.js';
import type { TrackedMr } from '../../entities/tracking/trackedMr.js';
import type { ReviewEvent } from '../../entities/tracking/reviewEvent.js';

export class InMemoryReviewRequestTrackingGateway implements ReviewRequestTrackingGateway {
  private storage = new Map<string, MrTrackingData>();

  loadTracking(projectPath: string): MrTrackingData | null {
    return this.storage.get(projectPath) ?? null;
  }

  saveTracking(projectPath: string, data: MrTrackingData): void {
    this.storage.set(projectPath, data);
  }

  getById(projectPath: string, reviewRequestId: string): TrackedMr | null {
    const data = this.storage.get(projectPath);
    if (!data) return null;

    return data.mrs.find((mr) => mr.id === reviewRequestId) ?? null;
  }

  getByNumber(
    projectPath: string,
    reviewRequestNumber: number,
    platform: Platform
  ): TrackedMr | null {
    const data = this.storage.get(projectPath);
    if (!data) return null;

    return data.mrs.find(
      (mr) => mr.mrNumber === reviewRequestNumber && mr.platform === platform
    ) ?? null;
  }

  create(projectPath: string, reviewRequest: TrackedMr): void {
    let data = this.storage.get(projectPath);
    if (!data) {
      data = {
        mrs: [],
        lastUpdated: new Date().toISOString(),
        stats: {
          totalMrs: 0,
          totalReviews: 0,
          totalFollowups: 0,
          averageReviewsPerMr: 0,
          averageTimeToApproval: null,
          topAssigners: [],
        },
      };
    }

    data.mrs.push(reviewRequest);
    data.stats.totalMrs = data.mrs.length;
    data.lastUpdated = new Date().toISOString();
    this.storage.set(projectPath, data);
  }

  update(
    projectPath: string,
    reviewRequestId: string,
    updates: Partial<TrackedMr>
  ): void {
    const data = this.storage.get(projectPath);
    if (!data) return;

    const index = data.mrs.findIndex((mr) => mr.id === reviewRequestId);
    if (index === -1) return;

    data.mrs[index] = { ...data.mrs[index], ...updates };
    data.lastUpdated = new Date().toISOString();
    this.storage.set(projectPath, data);
  }

  getByState(projectPath: string, state: TrackedMr['state']): TrackedMr[] {
    const data = this.storage.get(projectPath);
    if (!data) return [];

    return data.mrs.filter((mr) => mr.state === state);
  }

  getActiveMrs(projectPath: string): TrackedMr[] {
    const data = this.storage.get(projectPath);
    if (!data) return [];

    return data.mrs.filter((mr) => mr.state !== 'merged' && mr.state !== 'closed');
  }

  remove(projectPath: string, reviewRequestId: string): boolean {
    const data = this.storage.get(projectPath);
    if (!data) return false;

    const index = data.mrs.findIndex((mr) => mr.id === reviewRequestId);
    if (index === -1) return false;

    data.mrs.splice(index, 1);
    data.stats.totalMrs = data.mrs.length;
    data.lastUpdated = new Date().toISOString();
    this.storage.set(projectPath, data);
    return true;
  }

  archive(projectPath: string, reviewRequestId: string): boolean {
    return this.remove(projectPath, reviewRequestId);
  }

  recordReviewEvent(
    projectPath: string,
    reviewRequestId: string,
    event: ReviewEvent
  ): void {
    const data = this.storage.get(projectPath);
    if (!data) return;

    const mr = data.mrs.find((m) => m.id === reviewRequestId);
    if (!mr) return;

    mr.reviews.push(event);
    mr.lastReviewAt = event.timestamp;

    if (event.type === 'review') {
      mr.totalReviews++;
      data.stats.totalReviews++;
    } else {
      mr.totalFollowups++;
      data.stats.totalFollowups++;
    }

    mr.totalBlocking += event.blocking;
    mr.totalWarnings += event.warnings;
    mr.totalSuggestions += event.suggestions;
    mr.totalDurationMs += event.durationMs;

    data.lastUpdated = new Date().toISOString();
    this.storage.set(projectPath, data);
  }

  recordPush(
    projectPath: string,
    reviewRequestNumber: number,
    platform: Platform
  ): TrackedMr | null {
    const data = this.storage.get(projectPath);
    if (!data) return null;

    const mr = data.mrs.find(
      (m) => m.mrNumber === reviewRequestNumber && m.platform === platform
    );
    if (!mr) return null;

    mr.lastPushAt = new Date().toISOString();
    data.lastUpdated = new Date().toISOString();
    this.storage.set(projectPath, data);

    return mr;
  }

  clear(): void {
    this.storage.clear();
  }
}
