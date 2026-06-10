import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { startSupervisorScheduler } from '@/frameworks/scheduler/supervisorScheduler.js';
import { InMemorySupervisorStatusStore } from '@/modules/supervisor-management/interface-adapters/gateways/supervisorStatusStore.memory.gateway.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubSupervisorGateway } from '@/tests/stubs/supervisor.stub.js';
import { StubSupervisorLockGateway } from '@/tests/stubs/supervisorLock.stub.js';

describe('startSupervisorScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the supervisor check immediately at start', async () => {
    const supervisorGateway = new StubSupervisorGateway();
    supervisorGateway.setProbeResult({ state: 'up', reason: null });
    const lockGateway = new StubSupervisorLockGateway();
    const statusStore = new InMemorySupervisorStatusStore();
    const capturing = createCapturingLogger();

    const scheduler = startSupervisorScheduler({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => new Date('2026-05-23T08:00:00Z'),
      intervalMs: 60_000,
    });

    await vi.waitFor(() => {
      expect(supervisorGateway.probeCallCount).toBe(1);
    });

    scheduler.stop();
  });

  it('runs the supervisor check again after the configured interval', async () => {
    const supervisorGateway = new StubSupervisorGateway();
    supervisorGateway.setProbeResult({ state: 'up', reason: null });
    const lockGateway = new StubSupervisorLockGateway();
    const statusStore = new InMemorySupervisorStatusStore();
    const capturing = createCapturingLogger();

    const scheduler = startSupervisorScheduler({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => new Date('2026-05-23T08:00:00Z'),
      intervalMs: 60_000,
    });

    await vi.waitFor(() => {
      expect(supervisorGateway.probeCallCount).toBe(1);
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(supervisorGateway.probeCallCount).toBe(2);

    scheduler.stop();
  });

  it('stops scheduling after stop is called', async () => {
    const supervisorGateway = new StubSupervisorGateway();
    supervisorGateway.setProbeResult({ state: 'up', reason: null });
    const lockGateway = new StubSupervisorLockGateway();
    const statusStore = new InMemorySupervisorStatusStore();
    const capturing = createCapturingLogger();

    const scheduler = startSupervisorScheduler({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => new Date('2026-05-23T08:00:00Z'),
      intervalMs: 60_000,
    });

    await vi.waitFor(() => {
      expect(supervisorGateway.probeCallCount).toBe(1);
    });

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(supervisorGateway.probeCallCount).toBe(1);
  });
});
