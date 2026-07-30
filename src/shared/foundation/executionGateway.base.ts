export type ExecutionOutcome =
  | { type: string; status: 'succeeded' }
  | { type: string; status: 'skipped' }
  | { type: string; status: 'failed'; message: string };

export interface ExecutionResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /**
   * One entry per action, in execution order. Counts alone hide which verb failed and
   * why, so a resolve that never ran used to be indistinguishable from one that did.
   */
  outcomes: ExecutionOutcome[];
}

export type CommandExecutor = (command: string, args: string[], cwd: string) => void;

export interface CommandInfo {
  command: string;
  args: string[];
}

export function countSucceeded(result: ExecutionResult, actionType: string): number {
  return result.outcomes.filter(
    (outcome) => outcome.type === actionType && outcome.status === 'succeeded',
  ).length;
}

export function emptyExecutionResult(): ExecutionResult {
  return { total: 0, succeeded: 0, failed: 0, skipped: 0, outcomes: [] };
}

export abstract class ExecutionGatewayBase<
  TAction extends { type: string },
  TContext extends { localPath: string },
> {
  constructor(protected readonly executor: CommandExecutor) {}

  protected abstract buildCommand(action: TAction, context: TContext): CommandInfo | null;

  async execute(actions: TAction[], context: TContext): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      total: actions.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      outcomes: [],
    };

    for (const action of actions) {
      const command = this.buildCommand(action, context);

      if (command === null) {
        result.skipped++;
        result.outcomes.push({ type: action.type, status: 'skipped' });
        continue;
      }

      try {
        this.executor(command.command, command.args, context.localPath);
        result.succeeded++;
        result.outcomes.push({ type: action.type, status: 'succeeded' });
      } catch (error) {
        result.failed++;
        result.outcomes.push({
          type: action.type,
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }
}
