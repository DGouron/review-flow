import type { UseCase } from '../../shared/foundation/usecase.base.js';
import type { PidFileContent } from '../../shared/services/pidFileManager.js';

export interface QueryStatusDependencies {
  readPidFile: () => PidFileContent | null;
  isProcessRunning: (pid: number) => boolean;
  removePidFile: () => void;
}

export type QueryStatusResult =
  | { status: 'running'; pid: number; port: number; startedAt: string }
  | { status: 'stopped' };

export class QueryStatusUseCase implements UseCase<void, QueryStatusResult> {
  constructor(private readonly deps: QueryStatusDependencies) {}

  execute(): QueryStatusResult {
    const pidContent = this.deps.readPidFile();

    if (!pidContent) {
      return { status: 'stopped' };
    }

    if (!this.deps.isProcessRunning(pidContent.pid)) {
      this.deps.removePidFile();
      return { status: 'stopped' };
    }

    return {
      status: 'running',
      pid: pidContent.pid,
      port: pidContent.port,
      startedAt: pidContent.startedAt,
    };
  }
}
