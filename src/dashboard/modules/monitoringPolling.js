/**
 * Dashboard module — refresh loop of the Monitoring view (SPEC-234).
 */

export const MONITORING_REFRESH_INTERVAL_MS = 5000;

/**
 * @param {typeof fetch} [fetchImplementation]
 * @returns {Promise<Record<string, any>>}
 */
export async function fetchMonitoringSnapshot(fetchImplementation = fetch) {
  const response = await fetchImplementation('/api/monitoring', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Monitoring request failed: ${response.status}`);
  }
  return response.json();
}

/**
 * @param {{ refresh: () => Promise<unknown> }} options
 * @returns {{ start: () => void, stop: () => void, isRunning: () => boolean }}
 */
export function createMonitoringPoller({ refresh }) {
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  let refreshing = false;

  async function tick() {
    if (refreshing) return;
    refreshing = true;
    try {
      await refresh();
    } catch {
      // A failed refresh is reported by the view; the next tick tries again.
    } finally {
      refreshing = false;
    }
  }

  return {
    start() {
      if (timer !== null) return;
      void tick();
      timer = setInterval(() => void tick(), MONITORING_REFRESH_INTERVAL_MS);
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
    isRunning() {
      return timer !== null;
    },
  };
}
