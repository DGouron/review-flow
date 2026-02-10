import { describe, it, expect, vi } from 'vitest';
import { executeStop, type StopDeps } from '../../../main/cli.js';
import type { StopDaemonDependencies } from '../../../usecases/cli/stopDaemon.usecase.js';
import { createPidFileContent } from '../../factories/pidFileContent.factory.js';

function createFakeStopDeps(
  overrides?: Partial<StopDaemonDependencies>,
): StopDaemonDependencies {
  return {
    readPidFile: vi.fn(() => null),
    removePidFile: vi.fn(),
    isProcessRunning: vi.fn(() => false),
    killProcess: vi.fn(),
    ...overrides,
  };
}

function createFakeDeps(overrides?: Partial<StopDeps>): StopDeps {
  return {
    stopDaemonDeps: createFakeStopDeps(),
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
    ...overrides,
  };
}

describe('executeStop', () => {
  it('should log not running when server is not running', () => {
    const deps = createFakeDeps();

    executeStop(false, deps);

    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('not running'));
  });

  it('should log success when server is stopped', () => {
    const pidContent = createPidFileContent({ pid: 123 });
    const deps = createFakeDeps({
      stopDaemonDeps: createFakeStopDeps({
        readPidFile: vi.fn(() => pidContent),
        isProcessRunning: vi.fn(() => true),
      }),
    });

    executeStop(false, deps);

    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('123'));
  });

  it('should call exit(1) when stop fails', () => {
    const pidContent = createPidFileContent({ pid: 444 });
    const deps = createFakeDeps({
      stopDaemonDeps: createFakeStopDeps({
        readPidFile: vi.fn(() => pidContent),
        isProcessRunning: vi.fn(() => true),
        killProcess: vi.fn(() => { throw new Error('EPERM'); }),
      }),
    });

    executeStop(false, deps);

    expect(deps.exit).toHaveBeenCalledWith(1);
  });
});
