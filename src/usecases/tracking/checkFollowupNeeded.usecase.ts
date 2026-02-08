import type { UseCase } from '../../shared/foundation/usecase.base.js';
import type { ReviewRequestTrackingGateway } from '../../interface-adapters/gateways/reviewRequestTracking.gateway.js';

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
    if (mr.state !== 'pending-fix') return false;
    if (!mr.lastPushAt || !mr.lastReviewAt) return false;

    return new Date(mr.lastPushAt).getTime() > new Date(mr.lastReviewAt).getTime();
  }
}
