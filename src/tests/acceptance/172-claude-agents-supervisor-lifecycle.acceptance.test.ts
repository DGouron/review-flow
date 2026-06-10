import { describe, it, expect, beforeEach } from 'vitest';

import { InMemorySupervisorStatusStore } from '@/modules/supervisor-management/interface-adapters/gateways/supervisorStatusStore.memory.gateway.js';
import { checkSupervisorAndRespawn } from '@/modules/supervisor-management/usecases/checkSupervisorAndRespawn.usecase.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubSupervisorGateway } from '@/tests/stubs/supervisor.stub.js';
import { StubSupervisorLockGateway } from '@/tests/stubs/supervisorLock.stub.js';

const fixedNow = new Date('2026-05-23T08:00:00Z');

describe('SPEC-172: Claude agents supervisor lifecycle (acceptance)', () => {
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

  describe('Scenario 1: supervisor up at boot', () => {
    it('records state up and logs reachable, no spawn attempted', async () => {
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
      expect(capturing.infoMessages).toContain('Claude agents supervisor reachable');
      expect(statusStore.read().state).toBe('up');
    });
  });

  describe('Scenario 2: supervisor down at boot, spawn succeeds', () => {
    it('acquires the lock, spawns detached, logs the new PID, releases the lock', async () => {
      supervisorGateway.setProbeResult({ state: 'down', reason: 'exit code 1' });
      supervisorGateway.setSpawnResult({ state: 'spawned', pid: 12345, reason: null });

      const status = await checkSupervisorAndRespawn({
        supervisorGateway,
        lockGateway,
        statusStore,
        logger: capturing.logger,
        now: () => fixedNow,
      });

      expect(supervisorGateway.spawnCallCount).toBe(1);
      expect(lockGateway.acquireCallCount).toBe(1);
      expect(lockGateway.releaseCallCount).toBe(1);
      expect(status.state).toBe('up');
      expect(capturing.infoMessages.some((message) => message.includes('spawned'))).toBe(true);
      expect(capturing.infoMessages.some((message) => message.includes('12345'))).toBe(true);
    });
  });

  describe('Scenario 3: supervisor down at boot, spawn fails (binary not found)', () => {
    it('records state down with reason supervisor-spawn-failed and logs a warning', async () => {
      supervisorGateway.setProbeResult({ state: 'down', reason: 'command not found' });
      supervisorGateway.setSpawnResult({
        state: 'failed',
        pid: null,
        reason: 'claude binary not found in PATH',
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
      expect(statusStore.read().reason).toBe('supervisor-spawn-failed');
      expect(lockGateway.releaseCallCount).toBe(1);
    });
  });

  describe('Scenario 4: periodic re-check transitions up to down', () => {
    it('logs a warning on the down transition and attempts a respawn', async () => {
      supervisorGateway.setProbeResult({ state: 'up', reason: null });
      await checkSupervisorAndRespawn({
        supervisorGateway,
        lockGateway,
        statusStore,
        logger: capturing.logger,
        now: () => fixedNow,
      });
      expect(statusStore.read().state).toBe('up');

      supervisorGateway.setProbeResult({ state: 'down', reason: 'process disappeared' });
      supervisorGateway.setSpawnResult({ state: 'spawned', pid: 67890, reason: null });

      const status = await checkSupervisorAndRespawn({
        supervisorGateway,
        lockGateway,
        statusStore,
        logger: capturing.logger,
        now: () => new Date('2026-05-23T08:01:00Z'),
      });

      expect(capturing.warnMessages.some((message) => message.includes('down'))).toBe(true);
      expect(supervisorGateway.spawnCallCount).toBe(1);
      expect(status.state).toBe('up');
    });
  });

  describe('Lock guard: prevents duplicate spawns', () => {
    it('does not spawn when the lock is already held by a live owner', async () => {
      supervisorGateway.setProbeResult({ state: 'down', reason: 'exit code 1' });
      lockGateway.setAcquireResult({ acquired: false, reason: 'lock held by another process' });

      const status = await checkSupervisorAndRespawn({
        supervisorGateway,
        lockGateway,
        statusStore,
        logger: capturing.logger,
        now: () => fixedNow,
      });

      expect(supervisorGateway.spawnCallCount).toBe(0);
      expect(status.state).toBe('down');
    });
  });
});
