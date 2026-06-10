import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';

export function skipped(message?: string, evidence?: Record<string, unknown>): StepOutcome {
  return {
    status: 'skipped',
    message: message ?? null,
    remediation: null,
    evidence: evidence ?? null,
  };
}

export function succeeded(message?: string, evidence?: Record<string, unknown>): StepOutcome {
  return {
    status: 'succeeded',
    message: message ?? null,
    remediation: null,
    evidence: evidence ?? null,
  };
}

export function blocked(
  message: string,
  remediation: string,
  evidence?: Record<string, unknown>,
): StepOutcome {
  return {
    status: 'blocked',
    message,
    remediation,
    evidence: evidence ?? null,
  };
}

export function warning(message: string, evidence?: Record<string, unknown>): StepOutcome {
  return {
    status: 'warning',
    message,
    remediation: null,
    evidence: evidence ?? null,
  };
}

export function isFinalSuccess(outcome: StepOutcome): boolean {
  return (
    outcome.status === 'succeeded' || outcome.status === 'skipped' || outcome.status === 'warning'
  );
}

export function isBlocking(outcome: StepOutcome): boolean {
  return outcome.status === 'blocked';
}
