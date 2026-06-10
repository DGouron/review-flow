import type { MrTrackingData } from '@/modules/tracking/entities/tracking/mrTrackingData.js';
import type { ReviewEvent } from '@/modules/tracking/entities/tracking/reviewEvent.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';

export type Platform = 'gitlab' | 'github';

export interface ReviewRequestTrackingGateway {
  loadTracking(projectPath: string): MrTrackingData | null;
  saveTracking(projectPath: string, data: MrTrackingData): void;

  getById(projectPath: string, reviewRequestId: string): TrackedMr | null;
  getByNumber(
    projectPath: string,
    reviewRequestNumber: number,
    platform: Platform,
  ): TrackedMr | null;

  create(projectPath: string, reviewRequest: TrackedMr): void;
  update(projectPath: string, reviewRequestId: string, updates: Partial<TrackedMr>): void;

  getByState(projectPath: string, state: TrackedMr['state']): TrackedMr[];
  getActiveMrs(projectPath: string): TrackedMr[];
  remove(projectPath: string, reviewRequestId: string): boolean;
  archive(projectPath: string, reviewRequestId: string): boolean;

  recordReviewEvent(projectPath: string, reviewRequestId: string, event: ReviewEvent): void;
  recordPush(
    projectPath: string,
    reviewRequestNumber: number,
    platform: Platform,
  ): TrackedMr | null;
}
