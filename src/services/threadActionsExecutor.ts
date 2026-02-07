import { execSync } from 'node:child_process'
import type { ReviewAction } from '../entities/reviewAction/reviewAction.js'
import { GitLabReviewActionCliGateway } from '../interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.js'
import { GitHubReviewActionCliGateway } from '../interface-adapters/gateways/cli/reviewAction.github.cli.gateway.js'
import type { ExecutionResult, CommandExecutor } from '../entities/reviewAction/reviewAction.gateway.js'

const COMMAND_TIMEOUT_MS = 30000

/**
 * @deprecated Use ReviewAction instead
 */
export type ThreadAction = ReviewAction

export interface ExecutionContext {
  platform: 'gitlab' | 'github'
  projectPath: string
  mrNumber: number
  localPath: string
  diffMetadata?: import('../entities/reviewContext/reviewContext.js').DiffMetadata
}

export type { ExecutionResult, CommandExecutor }

interface Logger {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
  error: (obj: object, msg: string) => void
  debug: (obj: object, msg: string) => void
}

/**
 * @deprecated Use GitLabReviewActionCliGateway or GitHubReviewActionCliGateway directly
 */
export async function executeThreadActions(
  actions: ThreadAction[],
  context: ExecutionContext,
  _logger: Logger,
  executor: CommandExecutor
): Promise<ExecutionResult> {
  const gatewayContext = {
    projectPath: context.projectPath,
    mrNumber: context.mrNumber,
    localPath: context.localPath,
    diffMetadata: context.diffMetadata,
  }

  const gateway =
    context.platform === 'gitlab'
      ? new GitLabReviewActionCliGateway(executor)
      : new GitHubReviewActionCliGateway(executor)

  return gateway.execute(actions, gatewayContext)
}

export const defaultCommandExecutor: CommandExecutor = (
  command: string,
  args: string[],
  cwd: string
): void => {
  execSync(`${command} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd,
    encoding: 'utf-8',
    timeout: COMMAND_TIMEOUT_MS,
  })
}
