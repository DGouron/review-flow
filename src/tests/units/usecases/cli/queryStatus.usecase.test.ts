import { describe, it, expect, vi } from 'vitest';
import {
  QueryStatusUseCase,
  type QueryStatusDependencies,
} from '../../../../usecases/cli/queryStatus.usecase.js';
import { createPidFileContent } from '../../../factories/pidFileContent.factory.js';

function createFakeDeps(
  overrides?: Partial<QueryStatusDependencies>,
): QueryStatusDependencies {
  return {
    readPidFile: vi.fn(() => null),
    isProcessRunning: vi.fn(() => false),
    removePidFile: vi.fn(),
    ...overrides,
  };
}

describe('QueryStatusUseCase', () => {
  it('should return stopped when no PID file exists', () => {
    const usecase = new QueryStatusUseCase(createFakeDeps());

    const result = usecase.execute();

    expect(result).toEqual({ status: 'stopped' });
  });

  it('should return running with details when process is alive', () => {
    const pidContent = createPidFileContent({
      pid: 123,
      port: 4000,
      startedAt: '2026-01-15T10:30:00.000Z',
    });
    const deps = createFakeDeps({
      readPidFile: vi.fn(() => pidContent),
      isProcessRunning: vi.fn(() => true),
    });
    const usecase = new QueryStatusUseCase(deps);

    const result = usecase.execute();

    expect(result).toEqual({
      status: 'running',
      pid: 123,
      port: 4000,
      startedAt: '2026-01-15T10:30:00.000Z',
    });
  });

  it('should clean stale PID file and return stopped when process is dead', () => {
    const stale = createPidFileContent({ pid: 999 });
    const deps = createFakeDeps({
      readPidFile: vi.fn(() => stale),
      isProcessRunning: vi.fn(() => false),
    });
    const usecase = new QueryStatusUseCase(deps);

    const result = usecase.execute();

    expect(result).toEqual({ status: 'stopped' });
    expect(deps.removePidFile).toHaveBeenCalled();
  });
});
