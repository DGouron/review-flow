import type { UseCase } from '../../shared/foundation/usecase.base.js';
import type { PidFileContent } from '../../shared/services/pidFileManager.js';

export interface StopDaemonInput {
  force: boolean;
}

export interface StopDaemonDependencies {
  readPidFile: () => PidFileContent | null;
  removePidFile: () => void;
  isProcessRunning: (pid: number) => boolean;
  killProcess: (pid: number, signal: string) => void;
}

export type StopDaemonResult =
  | { status: 'stopped'; pid: number }
  | { status: 'not-running' }
  | { status: 'failed'; reason: string };

export class StopDaemonUseCase implements UseCase<StopDaemonInput, StopDaemonResult> {
  constructor(private readonly deps: StopDaemonDependencies) {}

  execute(input: StopDaemonInput): StopDaemonResult {
    const pidContent = this.deps.readPidFile();

    if (!pidContent) {
      return { status: 'not-running' };
    }

    if (!this.deps.isProcessRunning(pidContent.pid)) {
      this.deps.removePidFile();
      return { status: 'not-running' };
    }

    const signal = input.force ? 'SIGKILL' : 'SIGTERM';

    try {
      this.deps.killProcess(pidContent.pid, signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'failed', reason: message };
    }

    this.deps.removePidFile();
    return { status: 'stopped', pid: pidContent.pid };
  }
}
