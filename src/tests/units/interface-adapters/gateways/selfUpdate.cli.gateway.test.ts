import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

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
    isSupervisedBySystemd: false,
    exitProcess: vi.fn(),
    nodeExecutablePath: join(sandboxDir, 'no-node', 'bin', 'node'),
    packageRoot: join(sandboxDir, 'no-install'),
    environmentPath: '/usr/bin',
    ...overrides,
  };
}

function writePackageManifest(packageRoot: string, version: string): void {
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: 'reviewflow', version }));
}

function createGlobalInstall(relativePackageRoot: string, version: string): string {
  const prefix = join(sandboxDir, 'prefix');
  const packageRoot = join(prefix, relativePackageRoot);
  mkdirSync(packageRoot, { recursive: true });
  writePackageManifest(packageRoot, version);
  return prefix;
}

function createNpmNextToNode(prefix: string): string {
  const npmPath = join(prefix, 'bin', 'npm');
  mkdirSync(join(prefix, 'bin'), { recursive: true });
  writeFileSync(npmPath, '');
  return npmPath;
}

function runningFrom(
  prefix: string,
  relativePackageRoot: string,
): Partial<SelfUpdateCliDependencies> {
  return {
    nodeExecutablePath: join(prefix, 'bin', 'node'),
    packageRoot: join(prefix, relativePackageRoot),
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

  describe('installGlobalVersion', () => {
    it('should install the requested version with the npm next to the running node, into the prefix holding the running install', async () => {
      const prefix = createGlobalInstall('lib/node_modules/reviewflow', '3.56.2');
      const npmNextToNode = createNpmNextToNode(prefix);
      const deps = createFakeDependencies(runningFrom(prefix, 'lib/node_modules/reviewflow'));
      const gateway = new SelfUpdateCliGateway(deps);

      const outcome = await gateway.installGlobalVersion('3.57.0');

      expect(outcome).toEqual({ kind: 'installed' });
      expect(deps.execFileAsync).toHaveBeenCalledWith(
        npmNextToNode,
        ['install', '-g', 'reviewflow@3.57.0', '--prefer-online', '--prefix', prefix],
        { env: expect.objectContaining({ PATH: `${join(prefix, 'bin')}${delimiter}/usr/bin` }) },
      );
    });

    it('should fall back to the npm found in PATH when there is no npm next to the running node', async () => {
      const prefix = createGlobalInstall('lib/node_modules/reviewflow', '3.56.2');
      const deps = createFakeDependencies(runningFrom(prefix, 'lib/node_modules/reviewflow'));
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.installGlobalVersion('3.57.0');

      expect(deps.execFileAsync).toHaveBeenCalledWith('npm', expect.any(Array), expect.any(Object));
    });

    it('should discover the prefix of a layout without lib, such as Windows', async () => {
      const prefix = createGlobalInstall('node_modules/reviewflow', '3.56.2');
      const deps = createFakeDependencies(runningFrom(prefix, 'node_modules/reviewflow'));
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.installGlobalVersion('3.57.0');

      expect(deps.execFileAsync).toHaveBeenCalledWith(
        'npm',
        ['install', '-g', 'reviewflow@3.57.0', '--prefer-online', '--prefix', prefix],
        expect.any(Object),
      );
    });

    it('should let npm pick its own prefix when the running install is not inside a node_modules folder', async () => {
      const prefix = createGlobalInstall('opt/reviewflow', '3.56.2');
      const deps = createFakeDependencies(runningFrom(prefix, 'opt/reviewflow'));
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.installGlobalVersion('3.57.0');

      expect(deps.execFileAsync).toHaveBeenCalledWith(
        'npm',
        ['install', '-g', 'reviewflow@3.57.0', '--prefer-online'],
        expect.any(Object),
      );
    });

    it('should report permission-denied on EACCES', async () => {
      const deps = createFakeDependencies({
        execFileAsync: vi.fn().mockRejectedValue(new Error('EACCES: permission denied')),
      });
      const gateway = new SelfUpdateCliGateway(deps);

      const outcome = await gateway.installGlobalVersion('3.57.0');

      expect(outcome).toEqual({ kind: 'permission-denied' });
    });

    it('should report version-not-on-registry when npm cannot resolve the version yet', async () => {
      const deps = createFakeDependencies({
        execFileAsync: vi
          .fn()
          .mockRejectedValue(
            new Error(
              'npm error code ETARGET\nnpm error notarget No matching version found for reviewflow@3.57.0.',
            ),
          ),
      });
      const gateway = new SelfUpdateCliGateway(deps);

      const outcome = await gateway.installGlobalVersion('3.57.0');

      expect(outcome).toEqual({ kind: 'version-not-on-registry' });
    });

    it('should report failed with the npm error otherwise', async () => {
      const deps = createFakeDependencies({
        execFileAsync: vi.fn().mockRejectedValue(new Error('network error')),
      });
      const gateway = new SelfUpdateCliGateway(deps);

      const outcome = await gateway.installGlobalVersion('3.57.0');

      expect(outcome).toEqual({ kind: 'failed', error: 'network error' });
    });
  });

  describe('readInstalledVersion', () => {
    it('should read the version currently on disk for the running install, not the one loaded at boot', async () => {
      const prefix = createGlobalInstall('lib/node_modules/reviewflow', '3.56.2');
      const gateway = new SelfUpdateCliGateway(
        createFakeDependencies(runningFrom(prefix, 'lib/node_modules/reviewflow')),
      );
      writePackageManifest(join(prefix, 'lib/node_modules/reviewflow'), '3.57.0');

      expect(await gateway.readInstalledVersion()).toBe('3.57.0');
    });

    it('should return null when the running install has no readable manifest', async () => {
      const gateway = new SelfUpdateCliGateway(
        createFakeDependencies({ packageRoot: join(sandboxDir, 'missing') }),
      );

      expect(await gateway.readInstalledVersion()).toBeNull();
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

    it('should not exit the process when it is not supervised by systemd', async () => {
      const deps = createFakeDependencies();
      const gateway = new SelfUpdateCliGateway(deps);

      await gateway.restartDaemon(3847);

      expect(deps.exitProcess).not.toHaveBeenCalled();
    });

    describe('when supervised by systemd', () => {
      it('should exit with a failure code so systemd restarts the updated server', async () => {
        const deps = createFakeDependencies({ isSupervisedBySystemd: true });
        const gateway = new SelfUpdateCliGateway(deps);

        await gateway.restartDaemon(3847);

        expect(deps.exitProcess).toHaveBeenCalledWith(75);
      });

      it('should neither spawn a detached restarter nor signal any process, since systemd kills them with the unit', async () => {
        writePidFile(pidFilePath, { pid: 9999, startedAt: new Date().toISOString(), port: 4000 });
        const deps = createFakeDependencies({ isSupervisedBySystemd: true });
        const gateway = new SelfUpdateCliGateway(deps);

        await gateway.restartDaemon(3847);

        expect(deps.spawnDaemonDelayed).not.toHaveBeenCalled();
        expect(deps.killProcess).not.toHaveBeenCalled();
      });
    });
  });
});
