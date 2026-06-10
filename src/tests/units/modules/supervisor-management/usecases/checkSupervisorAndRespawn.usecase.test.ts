import { describe, it, expect, beforeEach } from 'vitest';

import { InMemorySupervisorStatusStore } from '@/modules/supervisor-management/interface-adapters/gateways/supervisorStatusStore.memory.gateway.js';
import { checkSupervisorAndRespawn } from '@/modules/supervisor-management/usecases/checkSupervisorAndRespawn.usecase.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubSupervisorGateway } from '@/tests/stubs/supervisor.stub.js';
import { StubSupervisorLockGateway } from '@/tests/stubs/supervisorLock.stub.js';

const fixedNow = new Date('2026-05-23T08:00:00Z');

describe('checkSupervisorAndRespawn use case', () => {
  let supervisorGateway: StubSupervisorGateway;
  let lockGateway: StubSupervisorLockGateway;
  let statusStore: InMemorySupervisorStatusStore;
  let capturing: ReturnType<typeof createCapturingLogger>;

  beforeEach(() => {
    supervisorGateway = new StubSupervisorGateway();
    lockGateway = new StubSupervisorLockGateway();
    statusStore = new InMemorySupervisorStatusStore();
    capturing = createCapturingLogger();
  });

  it('returns up and does not call spawn when the probe says up', async () => {
    supervisorGateway.setProbeResult({ state: 'up', reason: null });

    const status = await checkSupervisorAndRespawn({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => fixedNow,
    });

    expect(status.state).toBe('up');
    expect(status.reason).toBeNull();
    expect(supervisorGateway.spawnCallCount).toBe(0);
    expect(lockGateway.acquireCallCount).toBe(0);
  });

  it('writes the new status into the store', async () => {
    supervisorGateway.setProbeResult({ state: 'up', reason: null });

    await checkSupervisorAndRespawn({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => fixedNow,
    });

    expect(statusStore.read().state).toBe('up');
    expect(statusStore.read().lastCheckedAt.toISOString()).toBe('2026-05-23T08:00:00.000Z');
  });

  it('spawns a detached supervisor when probe says down and lock is acquired', async () => {
    supervisorGateway.setProbeResult({ state: 'down', reason: 'exit 1' });
    supervisorGateway.setSpawnResult({ state: 'spawned', pid: 42, reason: null });

    const status = await checkSupervisorAndRespawn({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => fixedNow,
    });

    expect(lockGateway.acquireCallCount).toBe(1);
    expect(supervisorGateway.spawnCallCount).toBe(1);
    expect(lockGateway.releaseCallCount).toBe(1);
    expect(status.state).toBe('up');
  });

  it('reports supervisor-spawn-failed when spawn fails', async () => {
    supervisorGateway.setProbeResult({ state: 'down', reason: 'exit 1' });
    supervisorGateway.setSpawnResult({
      state: 'failed',
      pid: null,
      reason: 'claude binary not found',
    });

    const status = await checkSupervisorAndRespawn({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => fixedNow,
    });

    expect(status.state).toBe('down');
    expect(status.reason).toBe('supervisor-spawn-failed');
    expect(capturing.warnMessages.length).toBeGreaterThan(0);
  });

  it('does not spawn when the lock cannot be acquired', async () => {
    supervisorGateway.setProbeResult({ state: 'down', reason: 'exit 1' });
    lockGateway.setAcquireResult({ acquired: false, reason: 'lock held' });

    const status = await checkSupervisorAndRespawn({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => fixedNow,
    });

    expect(supervisorGateway.spawnCallCount).toBe(0);
    expect(status.state).toBe('down');
    expect(lockGateway.releaseCallCount).toBe(0);
  });

  it('logs a warning when transitioning from up to down', async () => {
    supervisorGateway.setProbeResult({ state: 'up', reason: null });
    await checkSupervisorAndRespawn({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => fixedNow,
    });

    supervisorGateway.setProbeResult({ state: 'down', reason: 'process disappeared' });
    supervisorGateway.setSpawnResult({ state: 'spawned', pid: 7, reason: null });

    await checkSupervisorAndRespawn({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => fixedNow,
    });

    expect(capturing.warnMessages.some((message) => message.includes('down'))).toBe(true);
  });

  it('releases the lock even when spawn throws', async () => {
    supervisorGateway.setProbeResult({ state: 'down', reason: 'exit 1' });
    supervisorGateway.spawnDetached = async () => {
      throw new Error('spawn crashed');
    };

    const status = await checkSupervisorAndRespawn({
      supervisorGateway,
      lockGateway,
      statusStore,
      logger: capturing.logger,
      now: () => fixedNow,
    });

    expect(lockGateway.releaseCallCount).toBe(1);
    expect(status.state).toBe('down');
    expect(status.reason).toBe('supervisor-spawn-failed');
  });
});
