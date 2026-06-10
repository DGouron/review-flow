/**
 * Dashboard module — Setup Wizard stream client (SPEC-184, Iteration A).
 * Splits into pure decision functions (unit-tested) and a thin wiring function
 * `connectSetupWizardStream` that binds them to injected browser globals
 * (EventSource, document, localStorage). The pure half holds all the logic;
 * the wiring half is a humble glue object with no branching of its own.
 *
 * Transport: per-run SSE via EventSource (NOT the dashboard WebSocket bus).
 * Iteration A is read-only: awaiting_input renders informational only.
 */

const STORAGE_COMPLETION_KEY = 'reviewflow.setup.completed';

/**
 * @param {string} data
 * @returns {Record<string, unknown> | null}
 */
export function parseStreamMessage(data) {
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === 'object' && typeof parsed.step === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @param {Record<string, unknown>} event
 * @returns {Array<Record<string, unknown>>}
 */
export function appendEvent(events, event) {
  return [...events, event];
}

/**
 * @param {{ disconnected: boolean; complete: boolean }} input
 * @returns {boolean}
 */
export function shouldStartPolling(input) {
  return input.disconnected && !input.complete;
}

/**
 * Maps a polled setup-state.json snapshot into the degraded completion events
 * the view model can fold. Persisted state only carries terminal outcomes
 * (R8), so this can never reconstruct an in_progress cursor.
 *
 * @param {Record<string, unknown> | null} state
 * @returns {Array<Record<string, unknown>>}
 */
export function pollingStateToEvents(state) {
  if (state === null || typeof state !== 'object') {
    return [];
  }
  const steps = state.steps;
  if (steps === null || typeof steps !== 'object') {
    return [];
  }
  return Object.entries(steps).map(([step, value]) => {
    const outcome = value && typeof value === 'object' ? value : {};
    return {
      step,
      status: 'status' in outcome ? outcome.status : null,
      message: 'message' in outcome ? outcome.message : null,
      remediation: 'remediation' in outcome ? outcome.remediation : null,
    };
  });
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @returns {boolean}
 */
export function isRunComplete(events) {
  return events.some((event) => event.step === 'done' && event.status === 'completed');
}

/**
 * @param {{ isPrimaryTab: boolean; hasActiveRun: boolean }} input
 * @returns {{ readOnly: boolean; notice: string | null }}
 */
export function buildMultiTabViewState(input) {
  if (!input.isPrimaryTab && input.hasActiveRun) {
    return {
      readOnly: true,
      notice: '// SETUP DÉJÀ EN COURS dans un autre onglet',
    };
  }
  return { readOnly: false, notice: null };
}

/**
 * @param {{ matches: boolean } | null} mediaQuery
 * @returns {boolean}
 */
export function prefersReducedMotion(mediaQuery) {
  return mediaQuery !== null && mediaQuery.matches === true;
}

/**
 * Thin wiring: binds the pure decisions above to injected browser globals.
 * Not unit-tested (humble glue) — exercised in the browser only.
 *
 * @param {Object} options
 * @param {string} options.runId
 * @param {(events: Array<Record<string, unknown>>) => void} options.onEvents
 * @param {() => void} options.onDisconnected
 * @param {() => void} options.onComplete
 * @param {typeof EventSource} [options.eventSourceFactory]
 * @param {Storage} [options.storage]
 * @returns {{ close: () => void }}
 */
export function connectSetupWizardStream(options) {
  const EventSourceCtor = options.eventSourceFactory ?? globalThis.EventSource;
  const storage = options.storage ?? globalThis.localStorage ?? null;

  /** @type {Array<Record<string, unknown>>} */
  let events = [];
  const source = new EventSourceCtor(
    `/api/setup/events?runId=${encodeURIComponent(options.runId)}`,
  );

  source.addEventListener('message', (message) => {
    const event = parseStreamMessage(message.data);
    if (event === null) {
      return;
    }
    events = appendEvent(events, event);
    options.onEvents(events);
    if (isRunComplete(events)) {
      if (storage) {
        storage.setItem(STORAGE_COMPLETION_KEY, String(Date.now()));
      }
      source.close();
      options.onComplete();
    }
  });

  source.addEventListener('end', () => {
    source.close();
    if (shouldStartPolling({ disconnected: true, complete: isRunComplete(events) })) {
      options.onDisconnected();
    }
  });

  source.addEventListener('error', () => {
    source.close();
    if (shouldStartPolling({ disconnected: true, complete: isRunComplete(events) })) {
      options.onDisconnected();
    }
  });

  return {
    close: () => source.close(),
  };
}
