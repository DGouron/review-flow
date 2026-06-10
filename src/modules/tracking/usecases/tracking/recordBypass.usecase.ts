import { parseBypassMarker } from '@/modules/tracking/entities/bypassMarker/bypassMarker.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { BypassRecord } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

interface RecordBypassInput {
  projectPath: string;
  mrId: string;
  commentBody: string;
  author: string;
  now: () => string;
}

export type RecordBypassResult =
  | { kind: 'no-marker' }
  | { kind: 'recorded'; bypass: BypassRecord }
  | { kind: 'rejected-missing-reason'; message: string }
  | { kind: 'mr-not-found' };

const MISSING_REASON_MESSAGE =
  'Le bypass nécessite une raison explicite. Format attendu : /bypass-quality "raison"';

export class RecordBypassUseCase implements UseCase<RecordBypassInput, RecordBypassResult> {
  constructor(private readonly trackingGateway: ReviewRequestTrackingGateway) {}

  execute(input: RecordBypassInput): RecordBypassResult {
    const parsed = parseBypassMarker(input.commentBody);

    if (parsed.kind === 'no-marker') {
      return { kind: 'no-marker' };
    }

    if (parsed.kind === 'invalid-missing-reason') {
      return { kind: 'rejected-missing-reason', message: MISSING_REASON_MESSAGE };
    }

    const mr = this.trackingGateway.getById(input.projectPath, input.mrId);
    if (!mr) return { kind: 'mr-not-found' };

    const bypass: BypassRecord = {
      author: input.author,
      reason: parsed.reason,
      recordedAt: input.now(),
    };

    this.trackingGateway.update(input.projectPath, input.mrId, { bypass });

    return { kind: 'recorded', bypass };
  }
}
