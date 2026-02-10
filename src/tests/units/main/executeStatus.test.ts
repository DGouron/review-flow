import { describe, it, expect, vi } from 'vitest';
import { executeStatus, type StatusDeps } from '../../../main/cli.js';
import type { QueryStatusDependencies } from '../../../usecases/cli/queryStatus.usecase.js';
import { createPidFileContent } from '../../factories/pidFileContent.factory.js';

function createFakeQueryDeps(
  overrides?: Partial<QueryStatusDependencies>,
): QueryStatusDependencies {
  return {
    readPidFile: vi.fn(() => null),
    isProcessRunning: vi.fn(() => false),
    removePidFile: vi.fn(),
    ...overrides,
  };
}

function createFakeDeps(overrides?: Partial<StatusDeps>): StatusDeps {
  return {
    queryStatusDeps: createFakeQueryDeps(),
    log: vi.fn(),
    exit: vi.fn(),
    ...overrides,
  };
}

describe('executeStatus', () => {
  it('should log running status with details', () => {
    const pidContent = createPidFileContent({ pid: 123, port: 4000 });
    const deps = createFakeDeps({
      queryStatusDeps: createFakeQueryDeps({
        readPidFile: vi.fn(() => pidContent),
        isProcessRunning: vi.fn(() => true),
      }),
    });

    executeStatus(false, deps);

    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('running'));
    expect(deps.exit).not.toHaveBeenCalled();
  });

  it('should log not running and exit(1) when stopped', () => {
    const deps = createFakeDeps();

    executeStatus(false, deps);

    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('not running'));
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('should output JSON when --json flag is used', () => {
    const pidContent = createPidFileContent({ pid: 123, port: 4000 });
    const deps = createFakeDeps({
      queryStatusDeps: createFakeQueryDeps({
        readPidFile: vi.fn(() => pidContent),
        isProcessRunning: vi.fn(() => true),
      }),
    });

    executeStatus(true, deps);

    const logCall = (deps.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(logCall);
    expect(parsed.status).toBe('running');
    expect(parsed.pid).toBe(123);
  });

  it('should output JSON and exit(1) when stopped with --json', () => {
    const deps = createFakeDeps();

    executeStatus(true, deps);

    const logCall = (deps.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(logCall);
    expect(parsed.status).toBe('stopped');
    expect(deps.exit).toHaveBeenCalledWith(1);
  });
});
