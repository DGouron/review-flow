import type { UseCase } from '../../shared/foundation/usecase.base.js';
import type { PidFileContent } from '../../shared/services/pidFileManager.js';

export interface StartDaemonInput {
  daemon: boolean;
  port: number | undefined;
}

export interface StartDaemonDependencies {
  readPidFile: () => PidFileContent | null;
  writePidFile: (content: PidFileContent) => void;
  isProcessRunning: (pid: number) => boolean;
  spawnDaemon: (port: number | undefined) => number;
}

export type StartDaemonResult =
  | { status: 'started'; pid: number }
  | { status: 'already-running'; pid: number; port: number }
  | { status: 'foreground' };

const DEFAULT_PORT = 3000;

export class StartDaemonUseCase implements UseCase<StartDaemonInput, StartDaemonResult> {
  constructor(private readonly deps: StartDaemonDependencies) {}

  execute(input: StartDaemonInput): StartDaemonResult {
    if (!input.daemon) {
      return { status: 'foreground' };
    }

    const existing = this.deps.readPidFile();
    if (existing && this.deps.isProcessRunning(existing.pid)) {
      return { status: 'already-running', pid: existing.pid, port: existing.port };
    }

    const pid = this.deps.spawnDaemon(input.port);
    const port = input.port ?? DEFAULT_PORT;

    this.deps.writePidFile({
      pid,
      startedAt: new Date().toISOString(),
      port,
    });

    return { status: 'started', pid };
  }
}
