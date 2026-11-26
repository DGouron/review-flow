import { describe, expect, it } from 'vitest';

import { GetMonitoringSnapshotUseCase } from '@/modules/runtime-monitoring/usecases/getMonitoringSnapshot.usecase.js';
import { createSupervisorStatus } from '@/modules/supervisor-management/entities/supervisor/supervisorStatus.schema.js';
import { InMemorySupervisorStatusStore } from '@/modules/supervisor-management/interface-adapters/gateways/supervisorStatusStore.memory.gateway.js';
import { MonitoringFactory } from '@/tests/factories/monitoring.factory.js';
import { StubProcessTableGateway } from '@/tests/stubs/processTable.stub.js';
import { StubReviewSessionListingGateway } from '@/tests/stubs/reviewSessionListing.stub.js';
import { StubServerRuntimeGateway } from '@/tests/stubs/serverRuntime.stub.js';

function buildUseCase() {
  const serverRuntime = new StubServerRuntimeGateway(MonitoringFactory.serverRuntime());
  const processTable = new StubProcessTableGateway([
    MonitoringFactory.processRecord({ pid: 4100, cpuTimeMilliseconds: 1000, memoryBytes: 100 }),
    MonitoringFactory.processRecord({
      pid: 4101,
      parentPid: 4100,
      cpuTimeMilliseconds: 0,
      memoryBytes: 50,
    }),
  ]);
  const reviewSessionListing = new StubReviewSessionListingGateway([
    MonitoringFactory.reviewSession({ sessionId: 'a1', mainPid: 4100 }),
  ]);
  const supervisorStatusStore = new InMemorySupervisorStatusStore();
  const useCase = new GetMonitoringSnapshotUseCase({
    serverRuntime,
    processTable,
    reviewSessionListing,
    supervisorStatusStore,
    version: '1.2.3',
  });
  return { useCase, serverRuntime, processTable, reviewSessionListing, supervisorStatusStore };
}

describe('GetMonitoringSnapshotUseCase', () => {
  it('stamps the snapshot with the sampling time', async () => {
    const { useCase } = buildUseCase();

    const snapshot = await useCase.execute();

    expect(snapshot.sampledAt).toBe(new Date(1_000_000).toISOString());
  });

  it('reports an unknown supervisor that was never checked with a null check date', async () => {
    const { useCase } = buildUseCase();

    const snapshot = await useCase.execute();

    expect(snapshot.server.status).toBe('ok');
    expect(snapshot.server.supervisor).toEqual({
      state: 'unknown',
      reason: null,
      lastCheckedAt: null,
    });
  });

  it('reports a down supervisor as a degraded server', async () => {
    const { useCase, supervisorStatusStore } = buildUseCase();
    supervisorStatusStore.set(
      createSupervisorStatus('down', 'boom', new Date('2026-11-26T08:00:00Z')),
    );

    const snapshot = await useCase.execute();

    expect(snapshot.server.status).toBe('degraded');
    expect(snapshot.server.supervisor.lastCheckedAt).toBe('2026-11-26T08:00:00.000Z');
  });

  it('exposes the process pid, memory and the host resources', async () => {
    const { useCase } = buildUseCase();

    const snapshot = await useCase.execute();

    expect(snapshot.process.pid).toBe(1234);
    expect(snapshot.host).toEqual(MonitoringFactory.serverRuntime().host);
  });

  it('rounds the uptime down to the second', async () => {
    const { useCase, serverRuntime } = buildUseCase();
    serverRuntime.runtime = MonitoringFactory.serverRuntime({ uptimeSeconds: 12.9 });

    const snapshot = await useCase.execute();

    expect(snapshot.server.uptimeSeconds).toBe(12);
  });

  it('computes the session CPU from the previous measure of the same session', async () => {
    const { useCase, serverRuntime, processTable } = buildUseCase();
    await useCase.execute();
    serverRuntime.runtime = MonitoringFactory.serverRuntime({ sampledAtMilliseconds: 1_002_000 });
    processTable.records = [
      MonitoringFactory.processRecord({ pid: 4100, cpuTimeMilliseconds: 2000, memoryBytes: 100 }),
    ];

    const snapshot = await useCase.execute();

    expect(snapshot.sessions.items[0]).toMatchObject({
      processCount: 1,
      memoryBytes: 100,
      cpuPercent: 50,
    });
  });

  it('forgets the measure of a session that left, so its return starts a new measure', async () => {
    const { useCase, serverRuntime, reviewSessionListing } = buildUseCase();
    await useCase.execute();
    reviewSessionListing.sessions = [];
    serverRuntime.runtime = MonitoringFactory.serverRuntime({ sampledAtMilliseconds: 1_001_000 });
    await useCase.execute();
    reviewSessionListing.sessions = [
      MonitoringFactory.reviewSession({ sessionId: 'a1', mainPid: 4100 }),
    ];
    serverRuntime.runtime = MonitoringFactory.serverRuntime({ sampledAtMilliseconds: 1_002_000 });

    const snapshot = await useCase.execute();

    expect(snapshot.sessions.items[0].cpuPercent).toBeNull();
  });

  it('keeps sessions listed when the process table is unavailable', async () => {
    const { useCase, processTable } = buildUseCase();
    processTable.records = null;

    const snapshot = await useCase.execute();

    expect(snapshot.sessions).toEqual({
      available: true,
      resourcesAvailable: false,
      items: [
        {
          sessionId: 'a1',
          worktree: 'github-acme-app-1526',
          startedAt: '2026-11-26T09:00:00.000Z',
          processCount: 0,
          memoryBytes: null,
          cpuPercent: null,
        },
      ],
    });
  });
});
