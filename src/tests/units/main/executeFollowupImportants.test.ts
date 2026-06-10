import { describe, it, expect, vi } from 'vitest';

import {
  executeFollowupImportants,
  type FollowupImportantsDependencies,
} from '@/main/commands/followupImportants.command.js';

function createFakeFollowupDeps(
  overrides?: Partial<FollowupImportantsDependencies>,
): FollowupImportantsDependencies {
  return {
    readPidFile: vi.fn(() => null),
    isProcessRunning: vi.fn(() => false),
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
    fetch: vi.fn(async () => new Response('{}', { status: 200 })),
    ...overrides,
  };
}

describe('executeFollowupImportants', () => {
  describe('server not running branch', () => {
    it('logs error and exits 1 when no pid file exists', async () => {
      const deps = createFakeFollowupDeps({ readPidFile: vi.fn(() => null) });

      await executeFollowupImportants(undefined, deps);

      expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('Server is not running'));
      expect(deps.exit).toHaveBeenCalledWith(1);
      expect(deps.fetch).not.toHaveBeenCalled();
    });

    it('logs error and exits 1 when pid file exists but process is not running', async () => {
      const deps = createFakeFollowupDeps({
        readPidFile: vi.fn(() => ({ pid: 123, port: 3000 })),
        isProcessRunning: vi.fn(() => false),
      });

      await executeFollowupImportants(undefined, deps);

      expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('Server is not running'));
      expect(deps.exit).toHaveBeenCalledWith(1);
      expect(deps.fetch).not.toHaveBeenCalled();
    });
  });

  describe('nominal branch', () => {
    it('invokes fetch on the running server port when daemon is alive', async () => {
      const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const deps = createFakeFollowupDeps({
        readPidFile: vi.fn(() => ({ pid: 42, port: 4242 })),
        isProcessRunning: vi.fn(() => true),
        fetch,
      });

      await executeFollowupImportants('my-project', deps);

      expect(fetch).toHaveBeenCalled();
      expect(deps.exit).not.toHaveBeenCalled();
    });
  });
});
