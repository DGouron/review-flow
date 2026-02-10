import { describe, it, expect, vi } from 'vitest';
import {
  StopDaemonUseCase,
  type StopDaemonDependencies,
  type StopDaemonInput,
} from '../../../../usecases/cli/stopDaemon.usecase.js';
import { createPidFileContent } from '../../../factories/pidFileContent.factory.js';

function createFakeInput(overrides?: Partial<StopDaemonInput>): StopDaemonInput {
  return {
    force: false,
    ...overrides,
  };
}

function createFakeDeps(
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

describe('StopDaemonUseCase', () => {
  it('should return not-running when no PID file exists', () => {
    const usecase = new StopDaemonUseCase(createFakeDeps());

    const result = usecase.execute(createFakeInput());

    expect(result).toEqual({ status: 'not-running' });
  });

  it('should clean stale PID file when process is not running', () => {
    const stale = createPidFileContent({ pid: 111 });
    const deps = createFakeDeps({
      readPidFile: vi.fn(() => stale),
      isProcessRunning: vi.fn(() => false),
    });
    const usecase = new StopDaemonUseCase(deps);

    const result = usecase.execute(createFakeInput());

    expect(result).toEqual({ status: 'not-running' });
    expect(deps.removePidFile).toHaveBeenCalled();
  });

  it('should send SIGTERM for graceful stop', () => {
    const pidContent = createPidFileContent({ pid: 222 });
    const deps = createFakeDeps({
      readPidFile: vi.fn(() => pidContent),
      isProcessRunning: vi.fn(() => true),
    });
    const usecase = new StopDaemonUseCase(deps);

    const result = usecase.execute(createFakeInput({ force: false }));

    expect(result).toEqual({ status: 'stopped', pid: 222 });
    expect(deps.killProcess).toHaveBeenCalledWith(222, 'SIGTERM');
    expect(deps.removePidFile).toHaveBeenCalled();
  });

  it('should send SIGKILL for force stop', () => {
    const pidContent = createPidFileContent({ pid: 333 });
    const deps = createFakeDeps({
      readPidFile: vi.fn(() => pidContent),
      isProcessRunning: vi.fn(() => true),
    });
    const usecase = new StopDaemonUseCase(deps);

    const result = usecase.execute(createFakeInput({ force: true }));

    expect(result).toEqual({ status: 'stopped', pid: 333 });
    expect(deps.killProcess).toHaveBeenCalledWith(333, 'SIGKILL');
    expect(deps.removePidFile).toHaveBeenCalled();
  });

  it('should return failed when kill throws', () => {
    const pidContent = createPidFileContent({ pid: 444 });
    const deps = createFakeDeps({
      readPidFile: vi.fn(() => pidContent),
      isProcessRunning: vi.fn(() => true),
      killProcess: vi.fn(() => {
        throw new Error('EPERM');
      }),
    });
    const usecase = new StopDaemonUseCase(deps);

    const result = usecase.execute(createFakeInput());

    expect(result).toEqual({ status: 'failed', reason: 'EPERM' });
  });
});
