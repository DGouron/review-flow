import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { SetupRunRegistry } from '@/modules/setup-wizard/usecases/streamSetupRun.usecase.js';
import { StubSetupProcessGateway } from '@/tests/stubs/setupProcess.stub.js';

describe('SetupRunRegistry', () => {
  let registry: SetupRunRegistry;
  let gateway: StubSetupProcessGateway;

  beforeEach(() => {
    gateway = new StubSetupProcessGateway();
    registry = new SetupRunRegistry(gateway);
  });

  it('starts a run and returns a run id', () => {
    const result = registry.start({ projectPath: null });

    expect(result.status).toBe('started');
    if (result.status === 'started') {
      expect(result.runId).toMatch(/.+/);
    }
    expect(gateway.spawnCount).toBe(1);
  });

  it('rejects a second start while a run is already active', () => {
    registry.start({ projectPath: null });

    const second = registry.start({ projectPath: null });

    expect(second.status).toBe('already-active');
    expect(gateway.spawnCount).toBe(1);
  });

  it('allows a new run after the active run exits', () => {
    registry.start({ projectPath: null });
    gateway.exit(0);

    const second = registry.start({ projectPath: null });

    expect(second.status).toBe('started');
    expect(gateway.spawnCount).toBe(2);
  });

  it('forwards stdout lines to subscribed listeners of the active run', () => {
    const started = registry.start({ projectPath: null });
    const received: string[] = [];
    if (started.status === 'started') {
      registry.subscribe(started.runId, {
        onEvent: (line) => received.push(line),
        onClose: () => {},
      });
    }

    gateway.emitLine('{"step":"dependencies","status":"in_progress","message":"x"}');

    expect(received).toEqual(['{"step":"dependencies","status":"in_progress","message":"x"}']);
  });

  it('notifies subscribers when the process exits', () => {
    const started = registry.start({ projectPath: null });
    let closedCode: number | null | undefined;
    if (started.status === 'started') {
      registry.subscribe(started.runId, {
        onEvent: () => {},
        onClose: (code) => {
          closedCode = code;
        },
      });
    }

    gateway.exit(0);

    expect(closedCode).toBe(0);
  });

  it('reports no active run when none has started', () => {
    expect(registry.hasActiveRun()).toBe(false);
  });

  it('reports an active run after start', () => {
    registry.start({ projectPath: null });

    expect(registry.hasActiveRun()).toBe(true);
  });

  it('writes a submitted input line to the active run stdin', () => {
    const started = registry.start({ projectPath: null });
    const runId = started.status === 'started' ? started.runId : '';

    const result = registry.submitInput(runId, '/home/u/api');

    expect(result.status).toBe('written');
    expect(gateway.writtenLines).toEqual(['/home/u/api']);
  });

  it('rejects input for an unknown run id', () => {
    registry.start({ projectPath: null });

    const result = registry.submitInput('unknown-run', '/home/u/api');

    expect(result.status).toBe('no-active-run');
    expect(gateway.writtenLines).toEqual([]);
  });

  it('rejects input when no run has started', () => {
    const result = registry.submitInput('any', '/home/u/api');

    expect(result.status).toBe('no-active-run');
  });

  it('rejects input after the active run has exited', () => {
    const started = registry.start({ projectPath: null });
    const runId = started.status === 'started' ? started.runId : '';
    gateway.exit(0);

    const result = registry.submitInput(runId, '/home/u/api');

    expect(result.status).toBe('no-active-run');
    expect(gateway.writtenLines).toEqual([]);
  });

  it('cancels the active run, killing the process and allowing a new run', () => {
    registry.start({ projectPath: null });

    const result = registry.cancel();

    expect(result.status).toBe('cancelled');
    expect(gateway.killed).toBe(true);
    expect(registry.hasActiveRun()).toBe(false);

    const second = registry.start({ projectPath: null });
    expect(second.status).toBe('started');
    expect(gateway.spawnCount).toBe(2);
  });

  it('notifies subscribers when the run is cancelled', () => {
    const started = registry.start({ projectPath: null });
    let closed = false;
    if (started.status === 'started') {
      registry.subscribe(started.runId, {
        onEvent: () => {},
        onClose: () => {
          closed = true;
        },
      });
    }

    registry.cancel();

    expect(closed).toBe(true);
  });

  it('returns no-active-run when cancelling with no run in progress', () => {
    expect(registry.cancel().status).toBe('no-active-run');
  });

  describe('inactivity expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('cancels the run after the timeout once no subscriber remains', () => {
      const localGateway = new StubSetupProcessGateway();
      const localRegistry = new SetupRunRegistry(localGateway, { inactivityTimeoutMs: 1000 });
      const started = localRegistry.start({ projectPath: null });
      const runId = started.status === 'started' ? started.runId : '';
      const unsubscribe = localRegistry.subscribe(runId, { onEvent: () => {}, onClose: () => {} });
      unsubscribe();

      vi.advanceTimersByTime(1000);

      expect(localGateway.killed).toBe(true);
      expect(localRegistry.hasActiveRun()).toBe(false);
    });

    it('keeps the run alive when a new subscriber attaches before the timeout', () => {
      const localGateway = new StubSetupProcessGateway();
      const localRegistry = new SetupRunRegistry(localGateway, { inactivityTimeoutMs: 1000 });
      const started = localRegistry.start({ projectPath: null });
      const runId = started.status === 'started' ? started.runId : '';
      const unsubscribe = localRegistry.subscribe(runId, { onEvent: () => {}, onClose: () => {} });
      unsubscribe();
      vi.advanceTimersByTime(500);
      localRegistry.subscribe(runId, { onEvent: () => {}, onClose: () => {} });
      vi.advanceTimersByTime(500);

      expect(localGateway.killed).toBe(false);
      expect(localRegistry.hasActiveRun()).toBe(true);
    });
  });
});
