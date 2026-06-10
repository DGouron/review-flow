import type { SetupState } from '@/modules/setup-wizard/entities/setupState/setupState.schema.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import { isFinalSuccess } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';

export function createInitialState(now: () => Date): SetupState {
  const ts = now().toISOString();
  return {
    version: 1,
    startedAt: ts,
    updatedAt: ts,
    steps: {},
  };
}

export function markStep(
  state: SetupState,
  stepId: StepId,
  outcome: StepOutcome,
  now: () => Date,
): SetupState {
  return {
    ...state,
    updatedAt: now().toISOString(),
    steps: { ...state.steps, [stepId]: outcome },
  };
}

export function findFirstIncomplete(state: SetupState, orderedStepIds: StepId[]): StepId | null {
  for (const stepId of orderedStepIds) {
    const outcome = state.steps[stepId];
    if (!outcome || !isFinalSuccess(outcome)) {
      return stepId;
    }
  }
  return null;
}

export function isComplete(state: SetupState, orderedStepIds: StepId[]): boolean {
  return findFirstIncomplete(state, orderedStepIds) === null;
}
