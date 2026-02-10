import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type {
  ReviewRequestTrackingGateway,
  Platform,
} from '../reviewRequestTracking.gateway.js';
import { createEmptyStats, type MrTrackingData } from '../../../entities/tracking/mrTrackingData.js';
import type { TrackedMr } from '../../../entities/tracking/trackedMr.js';
import type { ReviewEvent } from '../../../entities/tracking/reviewEvent.js';
import type { ProjectStatsCalculator } from '../../presenters/projectStats.calculator.js';

function getTrackingPath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'mr-tracking.json');
}

function createEmptyTrackingData(): MrTrackingData {
  return {
    mrs: [],
    lastUpdated: new Date().toISOString(),
    stats: createEmptyStats(),
  };
}

export class FileSystemReviewRequestTrackingGateway implements ReviewRequestTrackingGateway {
  constructor(private readonly statsCalculator: ProjectStatsCalculator) {}

  loadTracking(projectPath: string): MrTrackingData | null {
    const trackingPath = getTrackingPath(projectPath);

    if (!existsSync(trackingPath)) {
      return null;
    }

    try {
      const content = readFileSync(trackingPath, 'utf-8');
      const data = JSON.parse(content) as MrTrackingData;

      if (!Array.isArray(data.mrs)) {
        data.mrs = [];
      }
      if (!data.stats) {
        data.stats = createEmptyStats();
      }

      return data;
    } catch {
      return null;
    }
  }

  saveTracking(projectPath: string, data: MrTrackingData): void {
    const trackingPath = getTrackingPath(projectPath);
    const dir = dirname(trackingPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    data.stats = this.statsCalculator.compute(data.mrs);
    data.lastUpdated = new Date().toISOString();
    writeFileSync(trackingPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  getById(projectPath: string, reviewRequestId: string): TrackedMr | null {
    const data = this.loadTracking(projectPath);
    if (!data) return null;

    return data.mrs.find((mr) => mr.id === reviewRequestId) ?? null;
  }

  getByNumber(
    projectPath: string,
    reviewRequestNumber: number,
    platform: Platform
  ): TrackedMr | null {
    const data = this.loadTracking(projectPath);
    if (!data) return null;

    return data.mrs.find(
      (mr) => mr.mrNumber === reviewRequestNumber && mr.platform === platform
    ) ?? null;
  }

  create(projectPath: string, reviewRequest: TrackedMr): void {
    let data = this.loadTracking(projectPath);
    if (!data) {
      data = createEmptyTrackingData();
    }

    data.mrs.push(reviewRequest);
    data.stats.totalMrs = data.mrs.length;
    this.saveTracking(projectPath, data);
  }

  update(
    projectPath: string,
    reviewRequestId: string,
    updates: Partial<TrackedMr>
  ): void {
    const data = this.loadTracking(projectPath);
    if (!data) return;

    const index = data.mrs.findIndex((mr) => mr.id === reviewRequestId);
    if (index === -1) return;

    data.mrs[index] = { ...data.mrs[index], ...updates };
    this.saveTracking(projectPath, data);
  }

  getByState(projectPath: string, state: TrackedMr['state']): TrackedMr[] {
    const data = this.loadTracking(projectPath);
    if (!data) return [];

    return data.mrs.filter((mr) => mr.state === state);
  }

  getActiveMrs(projectPath: string): TrackedMr[] {
    const data = this.loadTracking(projectPath);
    if (!data) return [];

    return data.mrs.filter((mr) => mr.state !== 'merged' && mr.state !== 'closed');
  }

  remove(projectPath: string, reviewRequestId: string): boolean {
    const data = this.loadTracking(projectPath);
    if (!data) return false;

    const index = data.mrs.findIndex((mr) => mr.id === reviewRequestId);
    if (index === -1) return false;

    data.mrs.splice(index, 1);
    data.stats.totalMrs = data.mrs.length;
    this.saveTracking(projectPath, data);
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
    const data = this.loadTracking(projectPath);
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

    this.saveTracking(projectPath, data);
  }

  recordPush(
    projectPath: string,
    reviewRequestNumber: number,
    platform: Platform
  ): TrackedMr | null {
    const data = this.loadTracking(projectPath);
    if (!data) return null;

    const mr = data.mrs.find(
      (m) => m.mrNumber === reviewRequestNumber && m.platform === platform
    );
    if (!mr) return null;

    mr.lastPushAt = new Date().toISOString();
    this.saveTracking(projectPath, data);

    return mr;
  }
}
