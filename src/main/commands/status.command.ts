import {
  QueryStatusUseCase,
  type QueryStatusDependencies,
} from '@/modules/cli-configuration/usecases/cli/queryStatus.usecase.js';
import { green, red, dim, bold } from '@/shared/services/ansiColors.js';

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

export function createStatusDependencies(pidDeps: QueryStatusDependencies): StatusDeps {
  return { queryStatusDeps: pidDeps, log: console.log, exit: process.exit };
}
