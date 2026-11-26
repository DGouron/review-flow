import type { QualityGrade } from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';
import {
  evaluateQualityGate,
  type QualityGateRejectionReason,
} from '@/modules/tracking/entities/qualityGate/qualityGate.js';
import { latestReviewOutcomeOf } from '@/modules/tracking/entities/tracking/latestReviewOutcome.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

interface HandlePlatformApprovalInput {
  projectPath: string;
  mrId: string;
  qualityThreshold: QualityGrade | null;
}

export type HandlePlatformApprovalResult =
  | { kind: 'allowed' }
  | { kind: 'bypass-active' }
  | { kind: 'mr-not-found' }
  | { kind: 'reverted'; reason: QualityGateRejectionReason; message: string };

function buildRevertMessage(gateMessage: string): string {
  const cause = gateMessage.charAt(0).toLowerCase() + gateMessage.slice(1);
  return `Approbation annulée : ${cause}. Utilisez \`/bypass-quality "raison"\` pour forcer.`;
}

export class HandlePlatformApprovalUseCase implements UseCase<
  HandlePlatformApprovalInput,
  HandlePlatformApprovalResult
> {
  constructor(private readonly trackingGateway: ReviewRequestTrackingGateway) {}

  execute(input: HandlePlatformApprovalInput): HandlePlatformApprovalResult {
    const mr = this.trackingGateway.getById(input.projectPath, input.mrId);
    if (!mr) return { kind: 'mr-not-found' };

    if (mr.bypass !== null) return { kind: 'bypass-active' };

    const gateResult = evaluateQualityGate({
      ...latestReviewOutcomeOf(mr),
      blockingIssues: mr.openThreads,
      threshold: input.qualityThreshold,
    });

    if (gateResult.allowed) return { kind: 'allowed' };

    return {
      kind: 'reverted',
      reason: gateResult.reason,
      message: buildRevertMessage(gateResult.message),
    };
  }
}
