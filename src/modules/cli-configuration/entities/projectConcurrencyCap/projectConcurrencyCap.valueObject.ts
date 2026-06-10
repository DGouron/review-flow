import {
  DEFAULT_PROJECT_CONCURRENCY_CAP,
  MAX_PROJECT_CONCURRENCY_CAP,
  MIN_PROJECT_CONCURRENCY_CAP,
  type ProjectConcurrencyCap,
} from '@/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.schema.js';

export {
  DEFAULT_PROJECT_CONCURRENCY_CAP,
  MAX_PROJECT_CONCURRENCY_CAP,
  MIN_PROJECT_CONCURRENCY_CAP,
};
export type { ProjectConcurrencyCap };

export const PROJECT_CAP_REQUIRED_MESSAGE = 'La valeur est obligatoire';
export const PROJECT_CAP_NOT_INTEGER_MESSAGE = 'La valeur doit être un nombre entier';
export const PROJECT_CAP_OUT_OF_RANGE_MESSAGE = 'La valeur doit être comprise entre 1 et 10';

export type ProjectConcurrencyCapValidation =
  | { ok: true; value: ProjectConcurrencyCap }
  | { ok: false; reason: string };

export function validateProjectConcurrencyCap(value: unknown): ProjectConcurrencyCapValidation {
  if (value === null || value === undefined || value === '') {
    return { ok: false, reason: PROJECT_CAP_REQUIRED_MESSAGE };
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false, reason: PROJECT_CAP_NOT_INTEGER_MESSAGE };
  }
  if (value < MIN_PROJECT_CONCURRENCY_CAP || value > MAX_PROJECT_CONCURRENCY_CAP) {
    return { ok: false, reason: PROJECT_CAP_OUT_OF_RANGE_MESSAGE };
  }
  return { ok: true, value };
}

export function effectiveProjectConcurrencyCap(config: {
  maxConcurrentReviews?: number | null;
}): number {
  const raw = config.maxConcurrentReviews;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return DEFAULT_PROJECT_CONCURRENCY_CAP;
  }
  if (raw < MIN_PROJECT_CONCURRENCY_CAP || raw > MAX_PROJECT_CONCURRENCY_CAP) {
    return DEFAULT_PROJECT_CONCURRENCY_CAP;
  }
  return raw;
}
