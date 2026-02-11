#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../cli/parseCliArgs.js';
import { validateDependencies } from '../shared/services/dependencyChecker.js';
import { startServer } from './server.js';
import { StartDaemonUseCase, type StartDaemonDependencies } from '../usecases/cli/startDaemon.usecase.js';
import { StopDaemonUseCase, type StopDaemonDependencies } from '../usecases/cli/stopDaemon.usecase.js';
import { QueryStatusUseCase, type QueryStatusDependencies } from '../usecases/cli/queryStatus.usecase.js';
import { ReadLogsUseCase, type ReadLogsDependencies } from '../usecases/cli/readLogs.usecase.js';
import { readPidFile, writePidFile, removePidFile } from '../shared/services/pidFileManager.js';
import { isProcessRunning } from '../shared/services/processChecker.js';
import { PID_FILE_PATH, LOG_FILE_PATH } from '../shared/services/daemonPaths.js';
import { spawnDaemon } from '../shared/services/daemonSpawner.js';
import { logFileExists, readLastLines, watchLogFile } from '../shared/services/logFileReader.js';
import { green, red, yellow, dim, bold } from '../shared/services/ansiColors.js';
import { formatStartupBanner } from '../cli/startupBanner.js';
import { openInBrowser } from '../shared/services/browserOpener.js';
import { loadConfig } from '../frameworks/config/configLoader.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  const packageJsonPath = join(currentDir, '..', '..', 'package.json');
  const raw = readFileSync(packageJsonPath, 'utf-8');
  return JSON.parse(raw).version;
}

function printHelp(): void {
  console.log(`reviewflow - Automated code review for GitLab/GitHub

Usage:
  reviewflow [command] [options]

Commands:
  start                    Start the review server (default)
  stop                     Stop the running daemon
  status                   Show server status
  logs                     Show daemon logs

Start options:
  -d, --daemon             Run as background daemon
  -p, --port <port>        Server port (default: from config)
  -o, --open               Open dashboard in default browser
  --skip-dependency-check  Skip external dependency verification

Stop options:
  -f, --force              Force stop (SIGKILL instead of SIGTERM)

Status options:
  --json                   Output status as JSON

Logs options:
  -f, --follow             Follow log output (tail -f)
  -n, --lines <count>      Number of lines to show (default: 20)

General options:
  -v, --version            Show version
  -h, --help               Show this help
`);
}

export interface StartDependencies {
  validateDependencies: () => { name: string; installUrl: string }[];
  startServer: (port?: number) => Promise<unknown>;
  exit: (code: number) => void;
  error: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  startDaemonDeps: StartDaemonDependencies;
  loadStartupInfo: () => { enabledPlatforms: Array<'gitlab' | 'github'>; defaultPort: number };
  openInBrowser: (url: string) => void;
}

function showBanner(
  port: number,
  daemonPid: number | null,
  open: boolean,
  deps: StartDependencies,
): void {
  const { enabledPlatforms } = deps.loadStartupInfo();
  const banner = formatStartupBanner({ port, enabledPlatforms, daemonPid });
  for (const line of banner.lines) {
    deps.log(line);
  }
  if (open) {
    deps.openInBrowser(banner.dashboardUrl);
  }
}

export function executeStart(
  skipDependencyCheck: boolean,
  daemon: boolean,
  port: number | undefined,
  open: boolean,
  deps: StartDependencies,
): void {
  const resolvedPort = port ?? deps.loadStartupInfo().defaultPort;

  if (daemon) {
    const usecase = new StartDaemonUseCase(deps.startDaemonDeps);
    const result = usecase.execute({ daemon: true, port });

    switch (result.status) {
      case 'started':
        showBanner(resolvedPort, result.pid, open, deps);
        break;
      case 'already-running':
        deps.log(yellow(`Server already running (PID: ${result.pid}, port: ${result.port})`));
        break;
      case 'foreground':
        break;
    }
    return;
  }

  if (!skipDependencyCheck) {
    const missing = deps.validateDependencies();
    if (missing.length > 0) {
      deps.error('Missing dependencies:');
      for (const dep of missing) {
        deps.error(`  - ${dep.name}: ${dep.installUrl}`);
      }
      deps.exit(1);
      return;
    }
  }

  const startForeground = async () => {
    try {
      await deps.startServer(port);
      showBanner(resolvedPort, null, open, deps);
    } catch (err) {
      deps.error('Fatal error:', err);
      deps.exit(1);
    }
  };
  startForeground();
}

export interface StopDeps {
  stopDaemonDeps: StopDaemonDependencies;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
}

export function executeStop(force: boolean, deps: StopDeps): void {
  const usecase = new StopDaemonUseCase(deps.stopDaemonDeps);
  const result = usecase.execute({ force });

  switch (result.status) {
    case 'stopped':
      deps.log(green(`Server stopped (PID: ${result.pid})`));
      break;
    case 'not-running':
      deps.log(yellow('Server is not running'));
      break;
    case 'failed':
      deps.error(red(`Failed to stop server: ${result.reason}`));
      deps.exit(1);
      break;
  }
}

export interface StatusDeps {
  queryStatusDeps: QueryStatusDependencies;
  log: (...args: unknown[]) => void;
  exit: (code: number) => void;
}

export function executeStatus(json: boolean, deps: StatusDeps): void {
  const usecase = new QueryStatusUseCase(deps.queryStatusDeps);
  const result = usecase.execute();

  if (json) {
    deps.log(JSON.stringify(result));
    if (result.status === 'stopped') deps.exit(1);
    return;
  }

  if (result.status === 'running') {
    deps.log(green(bold('ReviewFlow is running')));
    deps.log(dim(`  PID:        ${result.pid}`));
    deps.log(dim(`  Port:       ${result.port}`));
    deps.log(dim(`  Started at: ${result.startedAt}`));
  } else {
    deps.log(red('ReviewFlow is not running'));
    deps.exit(1);
  }
}

export interface LogsDeps {
  readLogsDeps: ReadLogsDependencies;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
}

export function executeLogs(follow: boolean, lines: number, deps: LogsDeps): void {
  const onLine = (line: string) => deps.log(line);
  const usecase = new ReadLogsUseCase(deps.readLogsDeps);
  const result = usecase.execute({ follow, lines, onLine });

  switch (result.status) {
    case 'no-logs':
      deps.error(yellow('No log file found. Start the daemon first.'));
      deps.exit(1);
      break;
    case 'read':
      for (const line of result.lines) {
        deps.log(line);
      }
      break;
    case 'following':
      for (const line of result.initialLines) {
        deps.log(line);
      }
      process.on('SIGINT', () => {
        result.stop();
        process.exit(0);
      });
      break;
  }
}

function createPidFileDeps() {
  return {
    readPidFile: () => readPidFile(PID_FILE_PATH),
    writePidFile: (content: Parameters<typeof writePidFile>[1]) => writePidFile(PID_FILE_PATH, content),
    removePidFile: () => removePidFile(PID_FILE_PATH),
    isProcessRunning: (pid: number) => isProcessRunning(pid),
  };
}

const isDirectlyExecuted =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  const args = parseCliArgs(process.argv.slice(2));

  switch (args.command) {
    case 'version':
      console.log(readVersion());
      break;

    case 'help':
      printHelp();
      break;

    case 'start': {
      const pidDeps = createPidFileDeps();
      executeStart(args.skipDependencyCheck, args.daemon, args.port, args.open, {
        validateDependencies,
        startServer: (port) => startServer({ portOverride: port }),
        exit: process.exit,
        error: console.error,
        log: console.log,
        startDaemonDeps: {
          ...pidDeps,
          spawnDaemon,
        },
        loadStartupInfo: () => {
          try {
            const config = loadConfig();
            const enabledPlatforms = [...new Set(
              config.repositories.filter(r => r.enabled).map(r => r.platform),
            )] as Array<'gitlab' | 'github'>;
            return { enabledPlatforms, defaultPort: config.server.port };
          } catch {
            return { enabledPlatforms: [], defaultPort: 3000 };
          }
        },
        openInBrowser,
      });
      break;
    }

    case 'stop': {
      const pidDeps = createPidFileDeps();
      executeStop(args.force, {
        stopDaemonDeps: {
          ...pidDeps,
          killProcess: (pid, signal) => process.kill(pid, signal as NodeJS.Signals),
        },
        log: console.log,
        error: console.error,
        exit: process.exit,
      });
      break;
    }

    case 'status': {
      const pidDeps = createPidFileDeps();
      executeStatus(args.json, {
        queryStatusDeps: pidDeps,
        log: console.log,
        exit: process.exit,
      });
      break;
    }

    case 'logs':
      executeLogs(args.follow, args.lines, {
        readLogsDeps: {
          logFileExists: () => logFileExists(LOG_FILE_PATH),
          readLastLines: (count) => readLastLines(LOG_FILE_PATH, count),
          watchFile: (onLine) => watchLogFile(LOG_FILE_PATH, onLine),
        },
        log: console.log,
        error: console.error,
        exit: process.exit,
      });
      break;
  }
}
