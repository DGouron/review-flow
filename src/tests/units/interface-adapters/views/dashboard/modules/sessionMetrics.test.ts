import { describe, expect, it } from 'vitest';
import {
  createSessionMetricsState,
  getSessionMetricsSnapshot,
  trackSessionAction,
  updatePriorityItemTracking,
} from '@/interface-adapters/views/dashboard/modules/sessionMetrics.js';

describe('trackSessionAction', () => {
  it('should set first useful action delay once and increment action breakdown', () => {
    const initialState = createSessionMetricsState(1000);
    const firstActionState = trackSessionAction(initialState, 'followup', 1800);
    const secondActionState = trackSessionAction(firstActionState, 'open', 2600);

    expect(firstActionState.firstUsefulActionDelayMs).toBe(800);
    expect(secondActionState.firstUsefulActionDelayMs).toBe(800);
    expect(secondActionState.actionCount).toBe(2);
    expect(secondActionState.actionBreakdown.followup).toBe(1);
    expect(secondActionState.actionBreakdown.open).toBe(1);
  });

  it('should fallback unknown action types to other', () => {
    const initialState = createSessionMetricsState(1000);
    const nextState = trackSessionAction(initialState, 'custom-action', 1500);

    expect(nextState.actionBreakdown.other).toBe(1);
  });
});

describe('updatePriorityItemTracking', () => {
  it('should start tracking when now lane item appears', () => {
    const initialState = createSessionMetricsState(1000);
    const nextState = updatePriorityItemTracking(initialState, {
      nowLaneItemId: 'mr-42',
      pendingFixIds: ['mr-42', 'mr-43'],
      nowMs: 2000,
    });

    expect(nextState.currentPriorityItemId).toBe('mr-42');
    expect(nextState.currentPriorityItemStartedAt).toBe(2000);
  });

  it('should record resolution time when tracked item leaves pending-fix list', () => {
    const startedState = updatePriorityItemTracking(createSessionMetricsState(1000), {
      nowLaneItemId: 'mr-42',
      pendingFixIds: ['mr-42'],
      nowMs: 2000,
    });

    const resolvedState = updatePriorityItemTracking(startedState, {
      nowLaneItemId: null,
      pendingFixIds: [],
      nowMs: 5000,
    });

    expect(resolvedState.resolvedPriorityDurationsMs).toEqual([3000]);
  });
});

describe('getSessionMetricsSnapshot', () => {
  it('should compute average priority resolution time', () => {
    const state = {
      ...createSessionMetricsState(1000),
      resolvedPriorityDurationsMs: [3000, 9000],
    };

    const snapshot = getSessionMetricsSnapshot(state);

    expect(snapshot.averagePriorityResolutionMs).toBe(6000);
  });
});
