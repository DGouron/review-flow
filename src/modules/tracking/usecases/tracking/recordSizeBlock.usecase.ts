import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { SizeBlockRecord } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

interface RecordSizeBlockInput {
  projectPath: string;
  mrId: string;
  countedLines: number;
  budget: number;
  message: string;
  now: () => string;
}

export type RecordSizeBlockResult =
  | { kind: 'recorded'; sizeBlock: SizeBlockRecord }
  | { kind: 'mr-not-found' };

export class RecordSizeBlockUseCase implements UseCase<
  RecordSizeBlockInput,
  RecordSizeBlockResult
> {
  constructor(private readonly trackingGateway: ReviewRequestTrackingGateway) {}

  execute(input: RecordSizeBlockInput): RecordSizeBlockResult {
    const mr = this.trackingGateway.getById(input.projectPath, input.mrId);
    if (!mr) return { kind: 'mr-not-found' };

    const sizeBlock: SizeBlockRecord = {
      countedLines: input.countedLines,
      budget: input.budget,
      message: input.message,
      blockedAt: input.now(),
    };

    this.trackingGateway.update(input.projectPath, input.mrId, { sizeBlock });

    return { kind: 'recorded', sizeBlock };
  }
}
