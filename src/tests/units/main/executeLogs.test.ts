import { describe, it, expect, vi } from 'vitest';
import { executeLogs, type LogsDeps } from '../../../main/cli.js';
import type { ReadLogsDependencies } from '../../../usecases/cli/readLogs.usecase.js';

function createFakeReadLogsDeps(
  overrides?: Partial<ReadLogsDependencies>,
): ReadLogsDependencies {
  return {
    logFileExists: vi.fn(() => false),
    readLastLines: vi.fn(() => []),
    watchFile: vi.fn(() => ({ stop: vi.fn() })),
    ...overrides,
  };
}

function createFakeDeps(overrides?: Partial<LogsDeps>): LogsDeps {
  return {
    readLogsDeps: createFakeReadLogsDeps(),
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
    ...overrides,
  };
}

describe('executeLogs', () => {
  it('should exit(1) when no log file exists', () => {
    const deps = createFakeDeps();

    executeLogs(false, 20, deps);

    expect(deps.error).toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('should output log lines when file exists', () => {
    const deps = createFakeDeps({
      readLogsDeps: createFakeReadLogsDeps({
        logFileExists: vi.fn(() => true),
        readLastLines: vi.fn(() => ['line 1', 'line 2']),
      }),
    });

    executeLogs(false, 20, deps);

    expect(deps.log).toHaveBeenCalledWith('line 1');
    expect(deps.log).toHaveBeenCalledWith('line 2');
  });

  it('should output initial lines and set up watcher in follow mode', () => {
    const stopFn = vi.fn();
    const deps = createFakeDeps({
      readLogsDeps: createFakeReadLogsDeps({
        logFileExists: vi.fn(() => true),
        readLastLines: vi.fn(() => ['initial']),
        watchFile: vi.fn(() => ({ stop: stopFn })),
      }),
    });

    executeLogs(true, 10, deps);

    expect(deps.log).toHaveBeenCalledWith('initial');
  });
});
