import type { MrTrackingData, TrackedMr, ReviewEvent } from '../../services/mrTrackingService.js';

export type Platform = 'gitlab' | 'github';

export interface ReviewRequestTrackingGateway {
  loadTracking(projectPath: string): MrTrackingData | null;
  saveTracking(projectPath: string, data: MrTrackingData): void;

  getById(projectPath: string, reviewRequestId: string): TrackedMr | undefined;
  getByNumber(
    projectPath: string,
    reviewRequestNumber: number,
    platform: Platform
  ): TrackedMr | undefined;

  create(projectPath: string, reviewRequest: TrackedMr): void;
  update(
    projectPath: string,
    reviewRequestId: string,
    updates: Partial<TrackedMr>
  ): void;

  recordReviewEvent(
    projectPath: string,
    reviewRequestId: string,
    event: ReviewEvent
  ): void;
  recordPush(
    projectPath: string,
    reviewRequestNumber: number,
    platform: Platform
  ): TrackedMr | undefined;
}
