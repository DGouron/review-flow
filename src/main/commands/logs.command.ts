import {
  ReadLogsUseCase,
  type ReadLogsDependencies,
} from '@/modules/cli-configuration/usecases/cli/readLogs.usecase.js';
import { yellow } from '@/shared/services/ansiColors.js';
import { LOG_FILE_PATH } from '@/shared/services/daemonPaths.js';
import { logFileExists, readLastLines, watchLogFile } from '@/shared/services/logFileReader.js';

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

export function createLogsDependencies(): LogsDeps {
  return {
    readLogsDeps: {
      logFileExists: () => logFileExists(LOG_FILE_PATH),
      readLastLines: (count) => readLastLines(LOG_FILE_PATH, count),
      watchFile: (onLine) => watchLogFile(LOG_FILE_PATH, onLine),
    },
    log: console.log,
    error: console.error,
    exit: process.exit,
  };
}
