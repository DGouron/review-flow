import type { ExecutionResult, CommandExecutor } from '../../entities/reviewAction/reviewAction.gateway.js'

export interface CommandInfo {
  command: string
  args: string[]
}

export abstract class ExecutionGatewayBase<TAction, TContext extends { localPath: string }> {
  constructor(protected readonly executor: CommandExecutor) {}

  protected abstract buildCommand(action: TAction, context: TContext): CommandInfo | null

  async execute(actions: TAction[], context: TContext): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      total: actions.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    }

    for (const action of actions) {
      const command = this.buildCommand(action, context)

      if (command === null) {
        result.skipped++
        continue
      }

      try {
        this.executor(command.command, command.args, context.localPath)
        result.succeeded++
      } catch {
        result.failed++
      }
    }

    return result
  }
}
