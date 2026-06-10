import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

interface CheckFollowupNeededInput {
  projectPath: string;
  mrNumber: number;
  platform: 'gitlab' | 'github';
}

export class CheckFollowupNeededUseCase implements UseCase<CheckFollowupNeededInput, boolean> {
  constructor(private readonly trackingGateway: ReviewRequestTrackingGateway) {}

  execute(input: CheckFollowupNeededInput): boolean {
    const mr = this.trackingGateway.getByNumber(input.projectPath, input.mrNumber, input.platform);

    if (!mr) return false;
    if (mr.state === 'merged' || mr.state === 'closed') return false;
    if (!mr.lastPushAt || !mr.lastReviewAt) return false;

    return new Date(mr.lastPushAt).getTime() > new Date(mr.lastReviewAt).getTime();
  }
}
