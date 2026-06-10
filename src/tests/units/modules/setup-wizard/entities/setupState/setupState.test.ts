import { describe, it, expect } from 'vitest';

import { setupStateGuard } from '@/modules/setup-wizard/entities/setupState/setupState.guard.js';
import {
  createInitialState,
  markStep,
  findFirstIncomplete,
  isComplete,
} from '@/modules/setup-wizard/entities/setupState/setupState.js';
import { STEP_IDS } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import { succeeded, blocked } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';

describe('setupState helpers', () => {
  const now = () => new Date('2026-05-28T10:00:00.000Z');

  it('createInitialState produces a valid empty state', () => {
    const state = createInitialState(now);
    expect(setupStateGuard.isValid(state)).toBe(true);
    expect(state.steps).toEqual({});
  });

  it('markStep records an outcome under the given step id', () => {
    const initial = createInitialState(now);
    const next = markStep(initial, 'dependencies', succeeded(), now);
    expect(next.steps.dependencies?.status).toBe('succeeded');
  });

  it('findFirstIncomplete returns the first step missing or blocked', () => {
    const state = createInitialState(now);
    const withDeps = markStep(state, 'dependencies', succeeded(), now);
    expect(findFirstIncomplete(withDeps, [...STEP_IDS])).toBe('claude-login');
  });

  it('findFirstIncomplete returns null when all steps are final-success', () => {
    let state = createInitialState(now);
    for (const id of STEP_IDS) {
      state = markStep(state, id, succeeded(), now);
    }
    expect(findFirstIncomplete(state, [...STEP_IDS])).toBeNull();
  });

  it('findFirstIncomplete treats blocked as incomplete', () => {
    const initial = createInitialState(now);
    const blockedState = markStep(initial, 'dependencies', blocked('m', 'r'), now);
    expect(findFirstIncomplete(blockedState, [...STEP_IDS])).toBe('dependencies');
  });

  it('isComplete returns true only when all steps are final-success', () => {
    let state = createInitialState(now);
    expect(isComplete(state, [...STEP_IDS])).toBe(false);
    for (const id of STEP_IDS) {
      state = markStep(state, id, succeeded(), now);
    }
    expect(isComplete(state, [...STEP_IDS])).toBe(true);
  });
});
