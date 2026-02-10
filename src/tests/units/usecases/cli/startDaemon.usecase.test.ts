import { describe, it, expect, vi } from 'vitest';
import {
  StartDaemonUseCase,
  type StartDaemonDependencies,
  type StartDaemonInput,
} from '../../../../usecases/cli/startDaemon.usecase.js';
import { createPidFileContent } from '../../../factories/pidFileContent.factory.js';

function createFakeInput(overrides?: Partial<StartDaemonInput>): StartDaemonInput {
  return {
    daemon: false,
    port: undefined,
    ...overrides,
  };
}

function createFakeDeps(
  overrides?: Partial<StartDaemonDependencies>,
): StartDaemonDependencies {
  return {
    readPidFile: vi.fn(() => null),
    writePidFile: vi.fn(),
    isProcessRunning: vi.fn(() => false),
    spawnDaemon: vi.fn(() => 42),
    ...overrides,
  };
}

describe('StartDaemonUseCase', () => {
  describe('when daemon mode is requested', () => {
    it('should spawn daemon and return started result', () => {
      const deps = createFakeDeps({ spawnDaemon: vi.fn(() => 99) });
      const usecase = new StartDaemonUseCase(deps);

      const result = usecase.execute(createFakeInput({ daemon: true, port: 4000 }));

      expect(result).toEqual({ status: 'started', pid: 99 });
      expect(deps.spawnDaemon).toHaveBeenCalledWith(4000);
    });

    it('should write PID file after spawning', () => {
      const deps = createFakeDeps({ spawnDaemon: vi.fn(() => 88) });
      const usecase = new StartDaemonUseCase(deps);

      usecase.execute(createFakeInput({ daemon: true, port: 5000 }));

      expect(deps.writePidFile).toHaveBeenCalledWith(
        expect.objectContaining({ pid: 88, port: 5000 }),
      );
    });

    it('should use default port 3000 when no port is specified', () => {
      const deps = createFakeDeps({ spawnDaemon: vi.fn(() => 77) });
      const usecase = new StartDaemonUseCase(deps);

      usecase.execute(createFakeInput({ daemon: true }));

      expect(deps.spawnDaemon).toHaveBeenCalledWith(undefined);
      expect(deps.writePidFile).toHaveBeenCalledWith(
        expect.objectContaining({ pid: 77, port: 3000 }),
      );
    });
  });

  describe('when server is already running', () => {
    it('should return already-running when PID file exists and process is alive', () => {
      const existing = createPidFileContent({ pid: 555, port: 3000 });
      const deps = createFakeDeps({
        readPidFile: vi.fn(() => existing),
        isProcessRunning: vi.fn(() => true),
      });
      const usecase = new StartDaemonUseCase(deps);

      const result = usecase.execute(createFakeInput({ daemon: true }));

      expect(result).toEqual({ status: 'already-running', pid: 555, port: 3000 });
      expect(deps.spawnDaemon).not.toHaveBeenCalled();
    });

    it('should clean stale PID file and proceed when process is dead', () => {
      const stale = createPidFileContent({ pid: 666 });
      const deps = createFakeDeps({
        readPidFile: vi.fn(() => stale),
        isProcessRunning: vi.fn(() => false),
        spawnDaemon: vi.fn(() => 777),
      });
      const usecase = new StartDaemonUseCase(deps);

      const result = usecase.execute(createFakeInput({ daemon: true }));

      expect(result).toEqual({ status: 'started', pid: 777 });
    });
  });

  describe('when foreground mode is requested', () => {
    it('should return foreground status', () => {
      const deps = createFakeDeps();
      const usecase = new StartDaemonUseCase(deps);

      const result = usecase.execute(createFakeInput({ daemon: false }));

      expect(result).toEqual({ status: 'foreground' });
      expect(deps.spawnDaemon).not.toHaveBeenCalled();
    });
  });
});
