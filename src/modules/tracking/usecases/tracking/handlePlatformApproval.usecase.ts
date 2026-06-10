import {
  evaluateQualityGate,
  type QualityGateRejectionReason,
} from '@/modules/tracking/entities/qualityGate/qualityGate.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

interface HandlePlatformApprovalInput {
  projectPath: string;
  mrId: string;
  qualityThreshold: number | null;
}

export type HandlePlatformApprovalResult =
  | { kind: 'allowed' }
  | { kind: 'bypass-active' }
  | { kind: 'mr-not-found' }
  | {
      kind: 'reverted';
      reason: QualityGateRejectionReason;
      threshold: number;
      latestScore: number;
      message: string;
    };

function buildRevertMessage(
  reason: QualityGateRejectionReason,
  threshold: number,
  latestScore: number,
): string {
  if (reason === 'below-threshold') {
    return `Approbation annulée : seuil qualité ${threshold}/10 non atteint (${latestScore}/10). Utilisez \`/bypass-quality "raison"\` pour forcer.`;
  }
  return 'Approbation annulée : issues bloquantes non résolues. Utilisez `/bypass-quality "raison"` pour forcer.';
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
      latestScore: mr.latestScore,
      blockingIssues: mr.openThreads,
      threshold: input.qualityThreshold,
    });

    if (gateResult.allowed) return { kind: 'allowed' };

    const latestScore = mr.latestScore ?? 0;
    const threshold = input.qualityThreshold ?? 0;
    return {
      kind: 'reverted',
      reason: gateResult.reason,
      threshold,
      latestScore,
      message: buildRevertMessage(gateResult.reason, threshold, latestScore),
    };
  }
}
