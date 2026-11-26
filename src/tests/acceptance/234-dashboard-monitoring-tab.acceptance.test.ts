/**
 * SPEC-234 — Monitoring view of the server and its review sessions.
 *
 * Outer-loop acceptance test. Source of truth: docs/specs/234-dashboard-monitoring-tab.md.
 */

import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import {
  MONITORING_REFRESH_INTERVAL_MS,
  createMonitoringPoller,
} from '@/dashboard/modules/monitoringPolling.js';
import {
  buildMonitoringViewModel,
  renderMonitoringViewHtml,
} from '@/dashboard/modules/monitoringView.js';
import { DASHBOARD_VIEWS } from '@/dashboard/modules/viewNavigation.js';
import { monitoringRoutes } from '@/modules/runtime-monitoring/interface-adapters/controllers/http/monitoring.routes.js';
import { GetMonitoringSnapshotUseCase } from '@/modules/runtime-monitoring/usecases/getMonitoringSnapshot.usecase.js';
import { createSupervisorStatus } from '@/modules/supervisor-management/entities/supervisor/supervisorStatus.schema.js';
import { InMemorySupervisorStatusStore } from '@/modules/supervisor-management/interface-adapters/gateways/supervisorStatusStore.memory.gateway.js';
import { MonitoringFactory } from '@/tests/factories/monitoring.factory.js';
import { StubProcessTableGateway } from '@/tests/stubs/processTable.stub.js';
import { StubReviewSessionListingGateway } from '@/tests/stubs/reviewSessionListing.stub.js';
import { StubServerRuntimeGateway } from '@/tests/stubs/serverRuntime.stub.js';

const MEGABYTE = 1024 * 1024;

function buildEnvironment() {
  const serverRuntime = new StubServerRuntimeGateway(
    MonitoringFactory.serverRuntime({
      uptimeSeconds: 3600,
      cpuTimeMilliseconds: 10_000,
      sampledAtMilliseconds: 1_000_000,
      memory: {
        rssBytes: 200 * MEGABYTE,
        heapUsedBytes: 80 * MEGABYTE,
        heapTotalBytes: 120 * MEGABYTE,
      },
    }),
  );
  const processTable = new StubProcessTableGateway([
    MonitoringFactory.processRecord({
      pid: 4100,
      parentPid: 1,
      cpuTimeMilliseconds: 5000,
      memoryBytes: 300 * MEGABYTE,
    }),
    MonitoringFactory.processRecord({
      pid: 4101,
      parentPid: 4100,
      cpuTimeMilliseconds: 1000,
      memoryBytes: 50 * MEGABYTE,
    }),
    MonitoringFactory.processRecord({
      pid: 4102,
      parentPid: 4101,
      cpuTimeMilliseconds: 0,
      memoryBytes: 10 * MEGABYTE,
    }),
  ]);
  const sessionListing = new StubReviewSessionListingGateway([
    MonitoringFactory.reviewSession({
      sessionId: 'a1b2c3d4',
      worktree: 'github-acme-app-1526',
      mainPid: 4100,
    }),
  ]);
  const supervisorStatusStore = new InMemorySupervisorStatusStore();
  supervisorStatusStore.set(createSupervisorStatus('up', null, new Date('2026-11-26T10:00:00Z')));
  const getMonitoringSnapshot = new GetMonitoringSnapshotUseCase({
    serverRuntime,
    processTable,
    reviewSessionListing: sessionListing,
    supervisorStatusStore,
    version: '3.57.0',
  });
  return {
    serverRuntime,
    processTable,
    sessionListing,
    supervisorStatusStore,
    getMonitoringSnapshot,
  };
}

async function fetchSnapshot(environment: ReturnType<typeof buildEnvironment>) {
  const application = Fastify();
  await application.register(monitoringRoutes, {
    getMonitoringSnapshot: environment.getMonitoringSnapshot,
  });
  await application.ready();
  const response = await application.inject({ method: 'GET', url: '/api/monitoring' });
  await application.close();
  return { statusCode: response.statusCode, body: JSON.parse(response.body) };
}

describe('SPEC-234 — Monitoring view', () => {
  afterEach(() => setLanguage('en'));

  it('nominal server: reports status, uptime, version and supervisor state', async () => {
    const environment = buildEnvironment();

    const { statusCode, body } = await fetchSnapshot(environment);

    expect(statusCode).toBe(200);
    expect(body.server).toEqual({
      status: 'ok',
      uptimeSeconds: 3600,
      version: '3.57.0',
      supervisor: { state: 'up', reason: null, lastCheckedAt: '2026-11-26T10:00:00.000Z' },
    });
  });

  it('supervisor down: the server is degraded and the reason is shown', async () => {
    const environment = buildEnvironment();
    environment.supervisorStatusStore.set(
      createSupervisorStatus('down', 'daemon unreachable', new Date('2026-11-26T10:00:00Z')),
    );

    const { body } = await fetchSnapshot(environment);

    expect(body.server.status).toBe('degraded');
    expect(body.server.supervisor.reason).toBe('daemon unreachable');
  });

  it('process memory: reports resident memory and heap', async () => {
    const { body } = await fetchSnapshot(buildEnvironment());

    expect(body.process.memory).toEqual({
      rssBytes: 200 * MEGABYTE,
      heapUsedBytes: 80 * MEGABYTE,
      heapTotalBytes: 120 * MEGABYTE,
    });
  });

  it('first measure: CPU usage is unknown for the process and every session', async () => {
    const { body } = await fetchSnapshot(buildEnvironment());

    expect(body.process.cpuPercent).toBeNull();
    expect(body.sessions.items[0].cpuPercent).toBeNull();
  });

  it('second measure: CPU usage of the process and of the session tree over the interval', async () => {
    const environment = buildEnvironment();
    await fetchSnapshot(environment);
    environment.serverRuntime.runtime = MonitoringFactory.serverRuntime({
      cpuTimeMilliseconds: 10_500,
      sampledAtMilliseconds: 1_001_000,
    });
    environment.processTable.records = [
      MonitoringFactory.processRecord({
        pid: 4100,
        parentPid: 1,
        cpuTimeMilliseconds: 6500,
        memoryBytes: 300 * MEGABYTE,
      }),
      MonitoringFactory.processRecord({
        pid: 4101,
        parentPid: 4100,
        cpuTimeMilliseconds: 1500,
        memoryBytes: 50 * MEGABYTE,
      }),
      MonitoringFactory.processRecord({
        pid: 4102,
        parentPid: 4101,
        cpuTimeMilliseconds: 0,
        memoryBytes: 10 * MEGABYTE,
      }),
    ];

    const { body } = await fetchSnapshot(environment);

    expect(body.process.cpuPercent).toBe(50);
    expect(body.sessions.items[0].cpuPercent).toBe(200);
  });

  it('review session listed: aggregates its whole process tree', async () => {
    const { body } = await fetchSnapshot(buildEnvironment());

    expect(body.sessions.available).toBe(true);
    expect(body.sessions.resourcesAvailable).toBe(true);
    expect(body.sessions.items).toEqual([
      {
        sessionId: 'a1b2c3d4',
        worktree: 'github-acme-app-1526',
        startedAt: '2026-11-26T09:00:00.000Z',
        processCount: 3,
        memoryBytes: 360 * MEGABYTE,
        cpuPercent: null,
      },
    ]);
  });

  it('no process table: sessions are listed without memory nor CPU', async () => {
    const environment = buildEnvironment();
    environment.processTable.records = null;

    const { body } = await fetchSnapshot(environment);

    expect(body.sessions.resourcesAvailable).toBe(false);
    expect(body.sessions.items[0]).toMatchObject({
      processCount: 0,
      memoryBytes: null,
      cpuPercent: null,
    });
  });

  it('session process gone: listed with memory and CPU unavailable', async () => {
    const environment = buildEnvironment();
    environment.sessionListing.sessions = [
      MonitoringFactory.reviewSession({
        sessionId: 'deadbeef',
        worktree: 'gitlab-acme-api-7',
        mainPid: 4200,
      }),
    ];

    const { body } = await fetchSnapshot(environment);

    expect(body.sessions.items[0]).toMatchObject({
      sessionId: 'deadbeef',
      processCount: 0,
      memoryBytes: null,
    });
  });

  it('listing failure: sessions unavailable, server and process blocks still present', async () => {
    const environment = buildEnvironment();
    environment.sessionListing.sessions = null;

    const { body } = await fetchSnapshot(environment);

    expect(body.sessions).toEqual({ available: false, resourcesAvailable: true, items: [] });
    expect(body.server.version).toBe('3.57.0');
    expect(body.process.memory.rssBytes).toBe(200 * MEGABYTE);
  });

  it('the dashboard offers a Monitoring view', () => {
    expect(DASHBOARD_VIEWS).toContain('monitoring');
  });

  it('view polling: refreshes every 5 s while active, stops when another view is shown', async () => {
    vi.useFakeTimers();
    const fetchMonitoring = vi.fn(async () => undefined);
    const poller = createMonitoringPoller({ refresh: fetchMonitoring });

    poller.start();
    await vi.advanceTimersByTimeAsync(MONITORING_REFRESH_INTERVAL_MS * 2);
    poller.stop();
    await vi.advanceTimersByTimeAsync(MONITORING_REFRESH_INTERVAL_MS * 3);
    vi.useRealTimers();

    expect(MONITORING_REFRESH_INTERVAL_MS).toBe(5000);
    expect(fetchMonitoring).toHaveBeenCalledTimes(3);
  });

  it('view rendering: no active session', async () => {
    setLanguage('fr');
    const environment = buildEnvironment();
    environment.sessionListing.sessions = [];
    const { body } = await fetchSnapshot(environment);

    const html = renderMonitoringViewHtml(buildMonitoringViewModel(body, t), t);

    expect(html).toContain('Aucune session de revue active');
    expect(html).toContain('3.57.0');
    expect(html).toContain('mesure en cours');
  });

  it('view rendering: unavailable session measures', async () => {
    setLanguage('fr');
    const environment = buildEnvironment();
    environment.processTable.records = null;
    const { body } = await fetchSnapshot(environment);

    const html = renderMonitoringViewHtml(buildMonitoringViewModel(body, t), t);

    expect(html).toContain('github-acme-app-1526');
    expect(html).toContain('indisponible');
  });
});
