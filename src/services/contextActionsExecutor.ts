import type { ReviewContext } from '../entities/reviewContext/reviewContext.js'
import type { ReviewAction } from '../entities/reviewAction/reviewAction.js'
import { GitLabReviewActionCliGateway } from '../interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.js'
import { GitHubReviewActionCliGateway } from '../interface-adapters/gateways/cli/reviewAction.github.cli.gateway.js'
import type { ExecutionResult, CommandExecutor } from '../entities/reviewAction/reviewAction.gateway.js'

/**
 * @deprecated Use ReviewContextAction from reviewAction entity instead
 */
export type { ReviewAction as ReviewContextAction }

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
export async function executeActionsFromContext(
  context: ReviewContext,
  localPath: string,
  _logger: Logger,
  executor: CommandExecutor
): Promise<ExecutionResult> {
  const gatewayContext = {
    projectPath: context.projectPath,
    mrNumber: context.mergeRequestNumber,
    localPath,
    diffMetadata: context.diffMetadata,
  }

  const gateway =
    context.platform === 'gitlab'
      ? new GitLabReviewActionCliGateway(executor)
      : new GitHubReviewActionCliGateway(executor)

  return gateway.execute(context.actions as ReviewAction[], gatewayContext)
}
