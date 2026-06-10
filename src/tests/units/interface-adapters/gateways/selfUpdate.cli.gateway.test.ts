import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  SelfUpdateCliGateway,
  type SelfUpdateCliDependencies,
} from '@/modules/cli-configuration/interface-adapters/gateways/selfUpdate.cli.gateway.js';
import { PID_FILE_PATH } from '@/shared/services/daemonPaths.js';
import { writePidFile, removePidFile } from '@/shared/services/pidFileManager.js';

function createFakeDependencies(
  overrides?: Partial<SelfUpdateCliDependencies>,
): SelfUpdateCliDependencies {
  return {
    execFileAsync: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
    killProcess: vi.fn(),
    spawnDaemonDelayed: vi.fn(),
    ...overrides,
  };
}

describe('SelfUpdateCliGateway', () => {
  beforeEach(() => {
    removePidFile(PID_FILE_PATH);
  });

  describe('runGlobalUpdate', () => {
    it('should return success when npm update succeeds', async () => {
      const deps = createFakeDependencies();
      const gateway = new SelfUpdateCliGateway(deps);

      const result = await gateway.runGlobalUpdate();

      expect(result.success).toBe(true);
      expect(result.permissionDenied).toBe(false);
      expect(deps.execFileAsync).toHaveBeenCalledWith('npm', ['update', '-g', 'reviewflow']);
    });

    it('should return permissionDenied true on EACCES error', async () => {
      const deps = createFakeDependencies({
        execFileAsync: vi.fn().mockRejectedValue(new Error('EACCES: permission denied')),
      });
      const gateway = new SelfUpdateCliGateway(deps);

      const result = await gateway.runGlobalUpdate();

      expect(result.success).toBe(false);
      expect(result.permissionDenied).toBe(true);
      expect(result.error).toBe('EACCES: permission denied');
    });

    it('should return permissionDenied false on non-EACCES error', async () => {
      const deps = createFakeDependencies({
        execFileAsync: vi.fn().mockRejectedValue(new Error('network error')),
      });
      const gateway = new SelfUpdateCliGateway(deps);

      const result = await gateway.runGlobalUpdate();

      expect(result.success).toBe(false);
      expect(result.permissionDenied).toBe(false);
      expect(result.error).toBe('network error');
    });
  });

  describe('restartDaemon', () => {
    it('should use server port when no pid file exists', async () => {
      const deps = createFakeDependencies();
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.restartDaemon(3847);

      expect(deps.spawnDaemonDelayed).toHaveBeenCalledWith(3847, expect.any(Number));
    });

    it('should use pid file port over server port when pid file exists', async () => {
      writePidFile(PID_FILE_PATH, { pid: 9999, startedAt: new Date().toISOString(), port: 4000 });
      const deps = createFakeDependencies();
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.restartDaemon(3847);

      expect(deps.spawnDaemonDelayed).toHaveBeenCalledWith(4000, expect.any(Number));
    });

    it('should kill process from pid file when it exists', async () => {
      writePidFile(PID_FILE_PATH, { pid: 9999, startedAt: new Date().toISOString(), port: 4000 });
      const deps = createFakeDependencies();
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.restartDaemon(3847);

      expect(deps.killProcess).toHaveBeenCalledWith(9999, 'SIGTERM');
    });

    it('should kill current process when no pid file exists', async () => {
      const deps = createFakeDependencies();
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.restartDaemon(3847);

      expect(deps.killProcess).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    });

    it('should spawn delayed daemon before killing process', async () => {
      const callOrder: string[] = [];
      const deps = createFakeDependencies({
        spawnDaemonDelayed: vi.fn(() => {
          callOrder.push('spawn');
        }),
        killProcess: vi.fn(() => {
          callOrder.push('kill');
        }),
      });
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.restartDaemon(3847);

      expect(callOrder).toEqual(['spawn', 'kill']);
    });

    it('should not throw when kill process fails', async () => {
      const deps = createFakeDependencies({
        killProcess: vi.fn(() => {
          throw new Error('No such process');
        }),
      });
      const gateway = new SelfUpdateCliGateway(deps);

      await expect(gateway.restartDaemon(3847)).resolves.not.toThrow();
    });

    it('should remove pid file before spawning', async () => {
      writePidFile(PID_FILE_PATH, { pid: 9999, startedAt: new Date().toISOString(), port: 4000 });
      const deps = createFakeDependencies();
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.restartDaemon(3847);

      const { readPidFile } = await import('@/shared/services/pidFileManager.js');
      expect(readPidFile(PID_FILE_PATH)).toBeNull();
    });
  });
});
