import type {
  StepOutcome,
  StepOutcomeStatus,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';

interface StepOutcomeOverrides {
  status?: StepOutcomeStatus;
  message?: string | null;
  remediation?: string | null;
  evidence?: Record<string, unknown> | null;
}

export const StepOutcomeFactory = {
  create(overrides: StepOutcomeOverrides = {}): StepOutcome {
    return {
      status: overrides.status ?? 'succeeded',
      message: overrides.message ?? null,
      remediation: overrides.remediation ?? null,
      evidence: overrides.evidence ?? null,
    };
  },
};
