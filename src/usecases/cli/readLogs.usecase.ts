import type { UseCase } from '../../shared/foundation/usecase.base.js';

export interface ReadLogsInput {
  lines: number;
  follow: boolean;
  onLine?: (line: string) => void;
}

export interface ReadLogsDependencies {
  logFileExists: () => boolean;
  readLastLines: (count: number) => string[];
  watchFile: (onLine: (line: string) => void) => { stop: () => void };
}

export type ReadLogsResult =
  | { status: 'no-logs' }
  | { status: 'read'; lines: string[] }
  | { status: 'following'; initialLines: string[]; stop: () => void };

export class ReadLogsUseCase implements UseCase<ReadLogsInput, ReadLogsResult> {
  constructor(private readonly deps: ReadLogsDependencies) {}

  execute(input: ReadLogsInput): ReadLogsResult {
    if (!this.deps.logFileExists()) {
      return { status: 'no-logs' };
    }

    const lines = this.deps.readLastLines(input.lines);

    if (!input.follow) {
      return { status: 'read', lines };
    }

    const onLine = input.onLine ?? (() => {});
    const watcher = this.deps.watchFile(onLine);

    return {
      status: 'following',
      initialLines: lines,
      stop: () => watcher.stop(),
    };
  }
}
