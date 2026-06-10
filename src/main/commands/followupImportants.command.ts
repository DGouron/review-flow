import { FollowupImportantsUseCase } from '@/modules/cli-configuration/usecases/cli/followupImportants.usecase.js';
import { red } from '@/shared/services/ansiColors.js';
import { PID_FILE_PATH } from '@/shared/services/daemonPaths.js';
import { readPidFile } from '@/shared/services/pidFileManager.js';
import { isProcessRunning } from '@/shared/services/processChecker.js';

export interface FollowupImportantsDependencies {
  readPidFile: () => { pid: number; port: number } | null;
  isProcessRunning: (pid: number) => boolean;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
  fetch: typeof globalThis.fetch;
}

export async function executeFollowupImportants(
  project: string | undefined,
  deps: FollowupImportantsDependencies,
): Promise<void> {
  const pidData = deps.readPidFile();
  if (!pidData || !deps.isProcessRunning(pidData.pid)) {
    deps.error(red('Server is not running. Start with: reviewflow start'));
    deps.exit(1);
    return;
  }

  const usecase = new FollowupImportantsUseCase({
    serverPort: pidData.port,
    log: deps.log,
    error: deps.error,
    fetch: deps.fetch,
  });

  await usecase.execute({ project });
}

export function createFollowupImportantsDependencies(): FollowupImportantsDependencies {
  return {
    readPidFile: () => readPidFile(PID_FILE_PATH),
    isProcessRunning,
    log: console.log,
    error: console.error,
    exit: process.exit,
    fetch: globalThis.fetch,
  };
}
