import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  SelfUpdateCliGateway,
  buildRestartArgs,
  type SelfUpdateCliDependencies,
} from '@/modules/cli-configuration/interface-adapters/gateways/selfUpdate.cli.gateway.js';
import { PID_FILE_PATH } from '@/shared/services/daemonPaths.js';
import { writePidFile, removePidFile } from '@/shared/services/pidFileManager.js';

// A throwaway pid file per test. Pointing these at PID_FILE_PATH used to delete the
// pid file of whatever daemon the developer had running, orphaning the process.
let sandboxDir: string;
let pidFilePath: string;

function createFakeDependencies(
  overrides?: Partial<SelfUpdateCliDependencies>,
): SelfUpdateCliDependencies {
  return {
    execFileAsync: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
    killProcess: vi.fn(),
    spawnDaemonDelayed: vi.fn(),
    pidFilePath,
    ...overrides,
  };
}

describe('SelfUpdateCliGateway', () => {
  beforeEach(() => {
    sandboxDir = mkdtempSync(join(tmpdir(), 'reviewflow-selfupdate-'));
    pidFilePath = join(sandboxDir, 'reviewflow.pid');
    removePidFile(pidFilePath);
  });

  afterEach(() => {
    rmSync(sandboxDir, { recursive: true, force: true });
  });

  it('never reaches for the real daemon pid file', () => {
    const deps = createFakeDependencies();

    expect(deps.pidFilePath).not.toBe(PID_FILE_PATH);
    expect(deps.pidFilePath.startsWith(tmpdir())).toBe(true);
  });

  describe('buildRestartArgs', () => {
    it('includes --daemon so the restarted process writes its pid file', () => {
      expect(buildRestartArgs(3847)).toContain('--daemon');
    });

    it('includes the port when one is given', () => {
      expect(buildRestartArgs(3847)).toEqual(
        expect.arrayContaining(['--port', '3847', '--daemon']),
      );
    });

    it('omits the port when none is given', () => {
      expect(buildRestartArgs(undefined)).not.toContain('--port');
    });
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
      writePidFile(pidFilePath, { pid: 9999, startedAt: new Date().toISOString(), port: 4000 });
      const deps = createFakeDependencies();
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.restartDaemon(3847);

      expect(deps.spawnDaemonDelayed).toHaveBeenCalledWith(4000, expect.any(Number));
    });

    it('should kill process from pid file when it exists', async () => {
      writePidFile(pidFilePath, { pid: 9999, startedAt: new Date().toISOString(), port: 4000 });
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
      writePidFile(pidFilePath, { pid: 9999, startedAt: new Date().toISOString(), port: 4000 });
      const deps = createFakeDependencies();
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.restartDaemon(3847);

      const { readPidFile } = await import('@/shared/services/pidFileManager.js');
      expect(readPidFile(pidFilePath)).toBeNull();
    });
  });
});
