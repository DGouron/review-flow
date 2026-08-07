import { EventEmitter } from 'node:events';

import { describe, it, expect } from 'vitest';

import {
  SupervisorCliGateway,
  createDefaultSupervisorSpawner,
} from '@/modules/supervisor-management/interface-adapters/gateways/supervisor.cli.gateway.js';
import type {
  SupervisorProcessProbe,
  SupervisorProcessSpawner,
} from '@/modules/supervisor-management/interface-adapters/gateways/supervisor.cli.gateway.js';

function stubProbe(result: {
  exitCode: number;
  stdout: string;
  timedOut: boolean;
}): SupervisorProcessProbe {
  return async () => result;
}

function stubSpawner(result: {
  pid: number | null;
  error: string | null;
}): SupervisorProcessSpawner {
  return () => result;
}

describe('SupervisorCliGateway.probe', () => {
  it('returns up when probe exits 0 with a JSON array on stdout', async () => {
    const gateway = new SupervisorCliGateway({
      probe: stubProbe({ exitCode: 0, stdout: '[]', timedOut: false }),
      spawn: stubSpawner({ pid: 1, error: null }),
    });

    const result = await gateway.probe();

    expect(result.state).toBe('up');
    expect(result.reason).toBeNull();
  });

  it('returns down when probe exits non-zero', async () => {
    const gateway = new SupervisorCliGateway({
      probe: stubProbe({ exitCode: 127, stdout: '', timedOut: false }),
      spawn: stubSpawner({ pid: 1, error: null }),
    });

    const result = await gateway.probe();

    expect(result.state).toBe('down');
    expect(result.reason).toContain('127');
  });

  it('returns down when probe stdout is not a JSON array', async () => {
    const gateway = new SupervisorCliGateway({
      probe: stubProbe({ exitCode: 0, stdout: '{"not":"array"}', timedOut: false }),
      spawn: stubSpawner({ pid: 1, error: null }),
    });

    const result = await gateway.probe();

    expect(result.state).toBe('down');
    expect(result.reason).toMatch(/json/i);
  });

  it('returns down when probe stdout is not valid JSON', async () => {
    const gateway = new SupervisorCliGateway({
      probe: stubProbe({ exitCode: 0, stdout: 'oops', timedOut: false }),
      spawn: stubSpawner({ pid: 1, error: null }),
    });

    const result = await gateway.probe();

    expect(result.state).toBe('down');
    expect(result.reason).toMatch(/json/i);
  });

  it('returns down with a timeout reason when probe times out', async () => {
    const gateway = new SupervisorCliGateway({
      probe: stubProbe({ exitCode: -1, stdout: '', timedOut: true }),
      spawn: stubSpawner({ pid: 1, error: null }),
    });

    const result = await gateway.probe();

    expect(result.state).toBe('down');
    expect(result.reason).toMatch(/timeout/i);
  });
});

describe('SupervisorCliGateway.spawnDetached', () => {
  it('returns spawned with the child pid on success', async () => {
    const gateway = new SupervisorCliGateway({
      probe: stubProbe({ exitCode: 0, stdout: '[]', timedOut: false }),
      spawn: stubSpawner({ pid: 4242, error: null }),
    });

    const result = await gateway.spawnDetached();

    expect(result.state).toBe('spawned');
    expect(result.pid).toBe(4242);
  });

  it('returns failed when the spawner reports an error', async () => {
    const gateway = new SupervisorCliGateway({
      probe: stubProbe({ exitCode: 0, stdout: '[]', timedOut: false }),
      spawn: stubSpawner({ pid: null, error: 'ENOENT' }),
    });

    const result = await gateway.spawnDetached();

    expect(result.state).toBe('failed');
    expect(result.reason).toBe('ENOENT');
  });

  it('returns failed when the spawner returns a null pid without explicit error', async () => {
    const gateway = new SupervisorCliGateway({
      probe: stubProbe({ exitCode: 0, stdout: '[]', timedOut: false }),
      spawn: stubSpawner({ pid: null, error: null }),
    });

    const result = await gateway.spawnDetached();

    expect(result.state).toBe('failed');
    expect(result.reason).toMatch(/pid/i);
  });
});

describe('createDefaultSupervisorSpawner', () => {
  function fakeChild(pid: number | undefined): EventEmitter & {
    pid: number | undefined;
    unref: () => void;
  } {
    const child = Object.assign(new EventEmitter(), { pid, unref: () => {} });
    return child;
  }

  it('reports the pid of the spawned supervisor', () => {
    const child = fakeChild(4242);
    const spawner = createDefaultSupervisorSpawner(() => child);

    expect(spawner()).toEqual({ pid: 4242, error: null });
  });

  it('survives an asynchronous spawn error instead of crashing the daemon', () => {
    const child = fakeChild(undefined);
    const spawner = createDefaultSupervisorSpawner(() => child);

    const result = spawner();

    expect(result.pid).toBeNull();
    expect(() => child.emit('error', new Error('spawn claude ENOENT'))).not.toThrow();
  });

  it('reports a synchronous spawn failure as an error', () => {
    const spawner = createDefaultSupervisorSpawner(() => {
      throw new Error('boom');
    });

    expect(spawner()).toEqual({ pid: null, error: 'boom' });
  });
});
