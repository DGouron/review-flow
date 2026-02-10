import { describe, it, expect, vi } from 'vitest';
import {
  ReadLogsUseCase,
  type ReadLogsDependencies,
  type ReadLogsInput,
} from '../../../../usecases/cli/readLogs.usecase.js';

function createFakeInput(overrides?: Partial<ReadLogsInput>): ReadLogsInput {
  return {
    lines: 20,
    follow: false,
    ...overrides,
  };
}

function createFakeDeps(
  overrides?: Partial<ReadLogsDependencies>,
): ReadLogsDependencies {
  return {
    logFileExists: vi.fn(() => false),
    readLastLines: vi.fn(() => []),
    watchFile: vi.fn(() => ({ stop: vi.fn() })),
    ...overrides,
  };
}

describe('ReadLogsUseCase', () => {
  it('should return no-logs when log file does not exist', () => {
    const usecase = new ReadLogsUseCase(createFakeDeps());

    const result = usecase.execute(createFakeInput());

    expect(result).toEqual({ status: 'no-logs' });
  });

  it('should return lines from log file', () => {
    const logLines = ['line 1', 'line 2', 'line 3'];
    const deps = createFakeDeps({
      logFileExists: vi.fn(() => true),
      readLastLines: vi.fn(() => logLines),
    });
    const usecase = new ReadLogsUseCase(deps);

    const result = usecase.execute(createFakeInput({ lines: 3 }));

    expect(result).toEqual({ status: 'read', lines: logLines });
    expect(deps.readLastLines).toHaveBeenCalledWith(3);
  });

  it('should return follow handle when follow mode is requested', () => {
    const stopFn = vi.fn();
    const deps = createFakeDeps({
      logFileExists: vi.fn(() => true),
      readLastLines: vi.fn(() => ['existing line']),
      watchFile: vi.fn(() => ({ stop: stopFn })),
    });
    const usecase = new ReadLogsUseCase(deps);

    const result = usecase.execute(createFakeInput({ follow: true, lines: 10 }));

    expect(result.status).toBe('following');
    if (result.status === 'following') {
      expect(result.initialLines).toEqual(['existing line']);
      result.stop();
      expect(stopFn).toHaveBeenCalled();
    }
  });

  it('should pass onLine callback to watchFile in follow mode', () => {
    const deps = createFakeDeps({
      logFileExists: vi.fn(() => true),
      readLastLines: vi.fn(() => []),
      watchFile: vi.fn(() => ({ stop: vi.fn() })),
    });
    const onLine = vi.fn();
    const usecase = new ReadLogsUseCase(deps);

    usecase.execute(createFakeInput({ follow: true, onLine }));

    expect(deps.watchFile).toHaveBeenCalledWith(onLine);
  });
});
