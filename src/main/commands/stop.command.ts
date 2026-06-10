import {
  StopDaemonUseCase,
  type StopDaemonDependencies,
} from '@/modules/cli-configuration/usecases/cli/stopDaemon.usecase.js';
import { green, red, yellow } from '@/shared/services/ansiColors.js';
import type { PidFileDeps } from '@/shared/services/pidFileManager.js';

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

export function createStopDependencies(pidDeps: PidFileDeps): StopDeps {
  return {
    stopDaemonDeps: {
      ...pidDeps,
      killProcess: (pid, signal) => process.kill(pid, signal),
    },
    log: console.log,
    error: console.error,
    exit: process.exit,
  };
}
