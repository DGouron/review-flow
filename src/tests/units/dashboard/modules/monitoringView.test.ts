import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import {
  buildMonitoringViewModel,
  formatCpuPercent,
  formatDuration,
  renderMonitoringStatusHtml,
  renderMonitoringViewHtml,
} from '@/dashboard/modules/monitoringView.js';

const MEGABYTE = 1024 * 1024;

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    sampledAt: '2026-11-26T10:00:00.000Z',
    server: {
      status: 'ok',
      uptimeSeconds: 93_780,
      version: '3.57.0',
      supervisor: { state: 'up', reason: null, lastCheckedAt: '2026-11-26T09:59:00.000Z' },
    },
    process: {
      pid: 4242,
      memory: {
        rssBytes: 200 * MEGABYTE,
        heapUsedBytes: 80 * MEGABYTE,
        heapTotalBytes: 120 * MEGABYTE,
      },
      cpuPercent: 12.5,
    },
    host: {
      loadAverage: { oneMinute: 0.5, fiveMinutes: 1.25, fifteenMinutes: 2 },
      totalMemoryBytes: 8192 * MEGABYTE,
      freeMemoryBytes: 2048 * MEGABYTE,
    },
    sessions: {
      available: true,
      resourcesAvailable: true,
      items: [
        {
          sessionId: 'a1',
          worktree: 'github-acme-app-1526',
          startedAt: '2026-11-26T09:48:00.000Z',
          processCount: 3,
          memoryBytes: 360 * MEGABYTE,
          cpuPercent: 200,
        },
      ],
    },
    ...overrides,
  };
}

describe('formatDuration', () => {
  it('reads days, hours, minutes or seconds depending on the length', () => {
    expect(formatDuration(93_780, t)).toBe('1 d 2 h');
    expect(formatDuration(3_900, t)).toBe('1 h 05 min');
    expect(formatDuration(720, t)).toBe('12 min');
    expect(formatDuration(42, t)).toBe('42 s');
  });

  it('shows a dash for an unknown duration', () => {
    expect(formatDuration(null, t)).toBe('—');
  });
});

describe('formatCpuPercent', () => {
  afterEach(() => setLanguage('en'));

  it('shows one decimal and a measuring label on the first measure', () => {
    setLanguage('fr');

    expect(formatCpuPercent(12.5, t)).toBe('12.5 %');
    expect(formatCpuPercent(null, t)).toBe('mesure en cours');
  });
});

describe('buildMonitoringViewModel', () => {
  it('formats the server, process and host measures', () => {
    const model = buildMonitoringViewModel(snapshot(), t);

    expect(model.server).toMatchObject({
      tone: 'ok',
      status: 'Operational',
      uptime: '1 d 2 h',
      version: '3.57.0',
      supervisor: 'Up',
      supervisorReason: null,
    });
    expect(model.process).toEqual({
      pid: 4242,
      rss: '200.0 MB',
      heapUsed: '80.0 MB',
      heapTotal: '120.0 MB',
      cpu: '12.5 %',
    });
    expect(model.host).toEqual({
      loadAverage: '0.50 · 1.25 · 2.00',
      freeMemory: '2.00 GB',
      totalMemory: '8.00 GB',
    });
  });

  it('flags a degraded server and keeps the supervisor reason', () => {
    const model = buildMonitoringViewModel(
      snapshot({
        server: {
          status: 'degraded',
          uptimeSeconds: 10,
          version: '3.57.0',
          supervisor: { state: 'down', reason: 'daemon unreachable', lastCheckedAt: null },
        },
      }),
      t,
    );

    expect(model.server).toMatchObject({ tone: 'error', status: 'Degraded', supervisor: 'Down' });
    expect(model.server.supervisorReason).toBe('daemon unreachable');
  });

  it('measures the age of each session from the sampling time', () => {
    const model = buildMonitoringViewModel(snapshot(), t);

    expect(model.sessions.rows).toEqual([
      {
        worktree: 'github-acme-app-1526',
        duration: '12 min',
        processes: '3',
        memory: '360.0 MB',
        cpu: '200.0 %',
      },
    ]);
    expect(model.sessions.notice).toBeNull();
  });

  it('marks a session without measures as unavailable', () => {
    const base = snapshot();
    const model = buildMonitoringViewModel(
      {
        ...base,
        sessions: {
          available: true,
          resourcesAvailable: false,
          items: [
            {
              ...base.sessions.items[0],
              startedAt: null,
              processCount: 0,
              memoryBytes: null,
              cpuPercent: null,
            },
          ],
        },
      },
      t,
    );

    expect(model.sessions.rows[0]).toEqual({
      worktree: 'github-acme-app-1526',
      duration: '—',
      processes: 'unavailable',
      memory: 'unavailable',
      cpu: 'unavailable',
    });
    expect(model.sessions.notice).toBe(t('monitoring.sessions.resourcesUnavailable'));
  });

  it('explains a failed session listing', () => {
    const model = buildMonitoringViewModel(
      snapshot({ sessions: { available: false, resourcesAvailable: true, items: [] } }),
      t,
    );

    expect(model.sessions.notice).toBe(t('monitoring.sessions.unavailable'));
  });
});

describe('renderMonitoringViewHtml', () => {
  afterEach(() => setLanguage('en'));

  it('renders the four blocks with the session table', () => {
    setLanguage('fr');

    const html = renderMonitoringViewHtml(buildMonitoringViewModel(snapshot(), t), t);

    expect(html).toContain('Serveur');
    expect(html).toContain('Processus ReviewFlow (PID 4242)');
    expect(html).toContain('Machine');
    expect(html).toContain('<td class="mono">github-acme-app-1526</td>');
    expect(html).toContain('dot-ok');
  });

  it('says when no review session is active', () => {
    setLanguage('fr');

    const html = renderMonitoringViewHtml(
      buildMonitoringViewModel(
        snapshot({ sessions: { available: true, resourcesAvailable: true, items: [] } }),
        t,
      ),
      t,
    );

    expect(html).toContain('Aucune session de revue active');
    expect(html).not.toContain('<table');
  });

  it('escapes values coming from the server', () => {
    const base = snapshot();
    const html = renderMonitoringViewHtml(
      buildMonitoringViewModel(
        {
          ...base,
          sessions: {
            ...base.sessions,
            items: [{ ...base.sessions.items[0], worktree: '<img onerror=x>' }],
          },
        },
        t,
      ),
      t,
    );

    expect(html).not.toContain('<img');
  });
});

describe('renderMonitoringStatusHtml', () => {
  it('renders a loading or offline message', () => {
    expect(renderMonitoringStatusHtml(t('monitoring.loading'))).toContain('queue-empty');
    expect(renderMonitoringStatusHtml('<b>')).toContain('&lt;b&gt;');
  });
});
