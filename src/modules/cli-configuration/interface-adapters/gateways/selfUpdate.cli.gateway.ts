import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

import type { SelfUpdateCommandPort } from '@/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.js';
import { PID_FILE_PATH } from '@/shared/services/daemonPaths.js';
import { readPidFile, removePidFile } from '@/shared/services/pidFileManager.js';

const defaultExecFileAsync = promisify(execFile);

const RESTART_DELAY_SECONDS = 2;

export interface SelfUpdateCliDependencies {
  execFileAsync: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  killProcess: (pid: number, signal: string) => void;
  spawnDaemonDelayed: (port: number | undefined, delaySec: number) => void;
  /**
   * Injectable so a test never reads or deletes the machine's live pid file —
   * doing so orphaned the running daemon and left `reviewflow stop` unable to find it.
   */
  pidFilePath: string;
}

function defaultSpawnDaemonDelayed(port: number | undefined, delaySec: number): void {
  const args = ['start', '--skip-dependency-check'];
  if (port !== undefined) {
    args.push('--port', String(port));
  }

  const command = `sleep ${delaySec} && ${process.execPath} ${process.argv[1]} ${args.join(' ')}`;
  const child = spawn('sh', ['-c', command], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, REVIEWFLOW_DAEMON: '1' },
  });
  child.unref();
}

function createDefaultDependencies(): SelfUpdateCliDependencies {
  return {
    execFileAsync: defaultExecFileAsync,
    killProcess: (pid, signal) => process.kill(pid, signal),
    spawnDaemonDelayed: defaultSpawnDaemonDelayed,
    pidFilePath: PID_FILE_PATH,
  };
}

export class SelfUpdateCliGateway implements SelfUpdateCommandPort {
  private readonly dependencies: SelfUpdateCliDependencies;

  constructor(dependencies?: SelfUpdateCliDependencies) {
    this.dependencies = dependencies ?? createDefaultDependencies();
  }

  async runGlobalUpdate(): Promise<{
    success: boolean;
    error: string | null;
    permissionDenied: boolean;
  }> {
    try {
      await this.dependencies.execFileAsync('npm', ['update', '-g', 'reviewflow']);
      return { success: true, error: null, permissionDenied: false };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const permissionDenied = error instanceof Error && error.message.includes('EACCES');
      return { success: false, error: message, permissionDenied };
    }
  }

  async restartDaemon(serverPort?: number): Promise<void> {
    const { pidFilePath } = this.dependencies;
    const pidFileContent = readPidFile(pidFilePath);
    const port = pidFileContent?.port ?? serverPort;
    const targetPid = pidFileContent?.pid ?? process.pid;

    removePidFile(pidFilePath);

    this.dependencies.spawnDaemonDelayed(port, RESTART_DELAY_SECONDS);

    try {
      this.dependencies.killProcess(targetPid, 'SIGTERM');
    } catch {
      // Process may already be dead
    }
  }
}
