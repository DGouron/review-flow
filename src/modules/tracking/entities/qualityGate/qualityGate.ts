import {
  isGradeWithin,
  type QualityGrade,
  type ReviewVerdict,
} from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';

export interface QualityGateInput {
  verdict: ReviewVerdict | null;
  grade: QualityGrade | null;
  blockingIssues: number;
  threshold: QualityGrade | null;
}

export type QualityGateRejectionReason =
  | 'verdict-missing'
  | 'blockers-present'
  | 'not-ready'
  | 'below-threshold';

export type QualityGateResult =
  | { allowed: true }
  | { allowed: false; reason: QualityGateRejectionReason; message: string };

const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  ready: 'prête',
  changes: 'à reprendre',
  stopped: 'stoppée',
  incomplete: 'incomplète',
};

export function evaluateQualityGate(input: QualityGateInput): QualityGateResult {
  if (input.threshold === null) {
    return { allowed: true };
  }

  if (input.verdict === null) {
    return {
      allowed: false,
      reason: 'verdict-missing',
      message: 'Aucun verdict de review : approbation impossible',
    };
  }

  if (input.blockingIssues > 0) {
    return {
      allowed: false,
      reason: 'blockers-present',
      message: 'Issues bloquantes non résolues',
    };
  }

  if (input.verdict !== 'ready') {
    return {
      allowed: false,
      reason: 'not-ready',
      message: `Review ${VERDICT_LABELS[input.verdict]} : approbation impossible`,
    };
  }

  if (input.grade !== null && !isGradeWithin(input.grade, input.threshold)) {
    return {
      allowed: false,
      reason: 'below-threshold',
      message: `Niveau qualité non atteint (${input.grade}, seuil ${input.threshold})`,
    };
  }

  return { allowed: true };
}
