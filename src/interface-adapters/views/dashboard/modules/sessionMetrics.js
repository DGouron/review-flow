const DEFAULT_ACTION_BREAKDOWN = {
  followup: 0,
  open: 0,
  approve: 0,
  cancelReview: 0,
  syncThreads: 0,
  other: 0,
};

/**
 * @param {number} [nowMs]
 * @returns {{
 *   sessionStartedAt: number,
 *   firstUsefulActionDelayMs: number | null,
 *   actionCount: number,
 *   actionBreakdown: Record<string, number>,
 *   currentPriorityItemId: string | null,
 *   currentPriorityItemStartedAt: number | null,
 *   resolvedPriorityDurationsMs: number[],
 * }}
 */
export function createSessionMetricsState(nowMs = Date.now()) {
  return {
    sessionStartedAt: nowMs,
    firstUsefulActionDelayMs: null,
    actionCount: 0,
    actionBreakdown: { ...DEFAULT_ACTION_BREAKDOWN },
    currentPriorityItemId: null,
    currentPriorityItemStartedAt: null,
    resolvedPriorityDurationsMs: [],
  };
}

/**
 * @param {ReturnType<typeof createSessionMetricsState>} state
 * @param {'followup' | 'open' | 'approve' | 'cancelReview' | 'syncThreads' | 'other' | string} actionType
 * @param {number} [nowMs]
 * @returns {ReturnType<typeof createSessionMetricsState>}
 */
export function trackSessionAction(state, actionType, nowMs = Date.now()) {
  const normalizedActionType = actionType in state.actionBreakdown ? actionType : 'other';
  const firstUsefulActionDelayMs = state.firstUsefulActionDelayMs === null
    ? Math.max(0, nowMs - state.sessionStartedAt)
    : state.firstUsefulActionDelayMs;

  return {
    ...state,
    firstUsefulActionDelayMs,
    actionCount: state.actionCount + 1,
    actionBreakdown: {
      ...state.actionBreakdown,
      [normalizedActionType]: state.actionBreakdown[normalizedActionType] + 1,
    },
  };
}

/**
 * @param {ReturnType<typeof createSessionMetricsState>} state
 * @param {{ nowLaneItemId: string | null, pendingFixIds: string[], nowMs?: number }} input
 * @returns {ReturnType<typeof createSessionMetricsState>}
 */
export function updatePriorityItemTracking(state, input) {
  const nowMs = input.nowMs ?? Date.now();
  let nextState = { ...state };

  const trackedItemId = state.currentPriorityItemId;
  const trackedStartAt = state.currentPriorityItemStartedAt;
  const trackedItemResolved = trackedItemId !== null && trackedStartAt !== null && !input.pendingFixIds.includes(trackedItemId);
  if (trackedItemResolved) {
    nextState = {
      ...nextState,
      resolvedPriorityDurationsMs: [
        ...nextState.resolvedPriorityDurationsMs,
        Math.max(0, nowMs - trackedStartAt),
      ],
      currentPriorityItemId: null,
      currentPriorityItemStartedAt: null,
    };
  }

  if (input.nowLaneItemId === null) {
    return {
      ...nextState,
      currentPriorityItemId: null,
      currentPriorityItemStartedAt: null,
    };
  }

  if (nextState.currentPriorityItemId !== input.nowLaneItemId) {
    return {
      ...nextState,
      currentPriorityItemId: input.nowLaneItemId,
      currentPriorityItemStartedAt: nowMs,
    };
  }

  return nextState;
}

/**
 * @param {ReturnType<typeof createSessionMetricsState>} state
 * @returns {{
 *   firstUsefulActionDelayMs: number | null,
 *   actionCount: number,
 *   actionBreakdown: Record<string, number>,
 *   averagePriorityResolutionMs: number | null,
 * }}
 */
export function getSessionMetricsSnapshot(state) {
  const averagePriorityResolutionMs = state.resolvedPriorityDurationsMs.length === 0
    ? null
    : state.resolvedPriorityDurationsMs.reduce((total, duration) => total + duration, 0) / state.resolvedPriorityDurationsMs.length;

  return {
    firstUsefulActionDelayMs: state.firstUsefulActionDelayMs,
    actionCount: state.actionCount,
    actionBreakdown: { ...state.actionBreakdown },
    averagePriorityResolutionMs,
  };
}
