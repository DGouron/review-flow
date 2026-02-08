import type { UseCase } from '../../shared/foundation/usecase.base.js';
import type { ReviewRequestTrackingGateway } from '../../interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '../../entities/tracking/trackedMr.js';

interface TransitionStateInput {
  projectPath: string;
  mrId: string;
  targetState: 'approved' | 'merged' | 'closed';
}

const TIMESTAMP_BY_STATE: Partial<Record<TransitionStateInput['targetState'], keyof TrackedMr>> = {
  approved: 'approvedAt',
  merged: 'mergedAt',
};

export class TransitionStateUseCase implements UseCase<TransitionStateInput, boolean> {
  constructor(private readonly trackingGateway: ReviewRequestTrackingGateway) {}

  execute(input: TransitionStateInput): boolean {
    const mr = this.trackingGateway.getById(input.projectPath, input.mrId);
    if (!mr) return false;

    const timestampField = TIMESTAMP_BY_STATE[input.targetState];

    this.trackingGateway.update(input.projectPath, input.mrId, {
      state: input.targetState,
      ...(timestampField ? { [timestampField]: new Date().toISOString() } : {}),
    });

    return true;
  }
}
