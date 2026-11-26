import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type {
  GlobalInstallOutcome,
  SelfUpdateCommandPort,
} from '@/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.js';
import { findReviewflowPackageRoot } from '@/modules/cli-configuration/interface-adapters/gateways/reviewflowCheckoutRoot.fs.js';
import { PID_FILE_PATH } from '@/shared/services/daemonPaths.js';
import { readPidFile, removePidFile } from '@/shared/services/pidFileManager.js';

const defaultExecFileAsync = promisify(execFile);

const RESTART_DELAY_SECONDS = 2;

const EXIT_CODE_ASKING_SUPERVISOR_RESTART = 75;

export interface SelfUpdateCliDependencies {
  execFileAsync: (
    command: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv },
  ) => Promise<{ stdout: string; stderr: string }>;
  killProcess: (pid: number, signal: string) => void;
  spawnDaemonDelayed: (port: number | undefined, delaySec: number) => void;
  /**
   * Injectable so a test never reads or deletes the machine's live pid file —
   * doing so orphaned the running daemon and left `reviewflow stop` unable to find it.
   */
  pidFilePath: string;
  /**
   * Under systemd a clean stop is never restarted and a detached restarter dies with the unit,
   * so the restart is handed over to systemd through a failure exit code.
   */
  isSupervisedBySystemd: boolean;
  exitProcess: (code: number) => void;
  nodeExecutablePath: string;
  /** Root of the reviewflow package this process was loaded from. */
  packageRoot: string;
  environmentPath: string;
}

export function buildRestartArgs(port: number | undefined): string[] {
  const args = ['start', '--skip-dependency-check'];
  if (port !== undefined) {
    args.push('--port', String(port));
  }
  args.push('--daemon');
  return args;
}

function defaultSpawnDaemonDelayed(port: number | undefined, delaySec: number): void {
  const args = buildRestartArgs(port);

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
    isSupervisedBySystemd: Boolean(process.env.INVOCATION_ID),
    exitProcess: (code) => process.exit(code),
    nodeExecutablePath: process.execPath,
    packageRoot: findReviewflowPackageRoot(fileURLToPath(new URL('.', import.meta.url))) ?? '',
    environmentPath: process.env.PATH ?? '',
  };
}

function discoverNpmCommand(nodeExecutablePath: string): string {
  const npmNextToNode = join(dirname(nodeExecutablePath), 'npm');
  return existsSync(npmNextToNode) ? npmNextToNode : 'npm';
}

function discoverGlobalPrefix(packageRoot: string): string | null {
  const nodeModulesDirectory = dirname(packageRoot);
  if (basename(nodeModulesDirectory) !== 'node_modules') {
    return null;
  }
  const parentDirectory = dirname(nodeModulesDirectory);
  return basename(parentDirectory) === 'lib' ? dirname(parentDirectory) : parentDirectory;
}

function toInstallFailureOutcome(error: unknown): GlobalInstallOutcome {
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (message.includes('EACCES')) {
    return { kind: 'permission-denied' };
  }
  if (message.includes('ETARGET')) {
    return { kind: 'version-not-on-registry' };
  }
  return { kind: 'failed', error: message };
}

export class SelfUpdateCliGateway implements SelfUpdateCommandPort {
  private readonly dependencies: SelfUpdateCliDependencies;

  constructor(dependencies?: SelfUpdateCliDependencies) {
    this.dependencies = dependencies ?? createDefaultDependencies();
  }

  async installGlobalVersion(version: string): Promise<GlobalInstallOutcome> {
    const { nodeExecutablePath, packageRoot, environmentPath } = this.dependencies;
    const globalPrefix = discoverGlobalPrefix(packageRoot);
    const prefixArgs = globalPrefix === null ? [] : ['--prefix', globalPrefix];
    const args = ['install', '-g', `reviewflow@${version}`, '--prefer-online', ...prefixArgs];
    const env = {
      ...process.env,
      PATH: `${dirname(nodeExecutablePath)}${delimiter}${environmentPath}`,
    };

    try {
      await this.dependencies.execFileAsync(discoverNpmCommand(nodeExecutablePath), args, { env });
      return { kind: 'installed' };
    } catch (error: unknown) {
      return toInstallFailureOutcome(error);
    }
  }

  async readInstalledVersion(): Promise<string | null> {
    try {
      const manifest: unknown = JSON.parse(
        readFileSync(join(this.dependencies.packageRoot, 'package.json'), 'utf-8'),
      );
      if (typeof manifest === 'object' && manifest !== null && 'version' in manifest) {
        return typeof manifest.version === 'string' ? manifest.version : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async restartDaemon(serverPort?: number): Promise<void> {
    if (this.dependencies.isSupervisedBySystemd) {
      this.dependencies.exitProcess(EXIT_CODE_ASKING_SUPERVISOR_RESTART);
      return;
    }

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
