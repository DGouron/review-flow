import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MONITORING_REFRESH_INTERVAL_MS,
  createMonitoringPoller,
  fetchMonitoringSnapshot,
} from '@/dashboard/modules/monitoringPolling.js';

describe('fetchMonitoringSnapshot', () => {
  it('reads the snapshot without browser cache', async () => {
    const fetchImplementation = vi.fn(
      async () => new Response('{"sampledAt":"x"}', { status: 200 }),
    );

    const snapshot = await fetchMonitoringSnapshot(fetchImplementation);

    expect(snapshot).toEqual({ sampledAt: 'x' });
    expect(fetchImplementation).toHaveBeenCalledWith('/api/monitoring', { cache: 'no-store' });
  });

  it('fails on an error status', async () => {
    const fetchImplementation = vi.fn(async () => new Response('', { status: 500 }));

    await expect(fetchMonitoringSnapshot(fetchImplementation)).rejects.toThrow('500');
  });
});

describe('createMonitoringPoller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refreshes at once on start, then every 5 seconds', async () => {
    const refresh = vi.fn(async () => undefined);
    const poller = createMonitoringPoller({ refresh });

    poller.start();
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MONITORING_REFRESH_INTERVAL_MS);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(poller.isRunning()).toBe(true);
  });

  it('stops refreshing once stopped', () => {
    const refresh = vi.fn(async () => undefined);
    const poller = createMonitoringPoller({ refresh });

    poller.start();
    poller.stop();
    vi.advanceTimersByTime(MONITORING_REFRESH_INTERVAL_MS * 4);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(poller.isRunning()).toBe(false);
  });

  it('does not start a second timer when started twice', async () => {
    const refresh = vi.fn(async () => undefined);
    const poller = createMonitoringPoller({ refresh });

    poller.start();
    poller.start();
    await vi.advanceTimersByTimeAsync(MONITORING_REFRESH_INTERVAL_MS);

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('skips a tick while the previous refresh is still running', async () => {
    const pendingRefreshes: Array<() => void> = [];
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          pendingRefreshes.push(resolve);
        }),
    );
    const poller = createMonitoringPoller({ refresh });

    poller.start();
    vi.advanceTimersByTime(MONITORING_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    for (const finishRefresh of pendingRefreshes) finishRefresh();
    await vi.advanceTimersByTimeAsync(MONITORING_REFRESH_INTERVAL_MS);

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('keeps polling after a failed refresh', async () => {
    const refresh = vi.fn(async () => {
      throw new Error('offline');
    });
    const poller = createMonitoringPoller({ refresh });

    poller.start();
    await vi.advanceTimersByTimeAsync(MONITORING_REFRESH_INTERVAL_MS);

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
