import type { UseCase } from '../../shared/foundation/usecase.base.js';
import type { ReviewRequestTrackingGateway } from '../../interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '../../entities/tracking/trackedMr.js';

interface RecordPushInput {
  projectPath: string;
  mrNumber: number;
  platform: 'gitlab' | 'github';
}

export class RecordPushUseCase implements UseCase<RecordPushInput, TrackedMr | null> {
  constructor(private readonly trackingGateway: ReviewRequestTrackingGateway) {}

  execute(input: RecordPushInput): TrackedMr | null {
    return this.trackingGateway.recordPush(input.projectPath, input.mrNumber, input.platform);
  }
}
