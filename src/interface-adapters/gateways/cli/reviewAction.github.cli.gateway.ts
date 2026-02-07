import type { ReviewAction } from '../../../entities/reviewAction/reviewAction.js'
import type { ReviewActionGateway, ExecutionContext } from '../../../entities/reviewAction/reviewAction.gateway.js'
import { ExecutionGatewayBase, type CommandInfo } from '../../../shared/foundation/executionGateway.base.js'

export class GitHubReviewActionCliGateway
  extends ExecutionGatewayBase<ReviewAction, ExecutionContext>
  implements ReviewActionGateway
{
  protected buildCommand(action: ReviewAction, context: ExecutionContext): CommandInfo | null {
    switch (action.type) {
      case 'THREAD_RESOLVE':
        return {
          command: 'gh',
          args: [
            'api',
            'graphql',
            '-f',
            `query=mutation { resolveReviewThread(input: {threadId: "${action.threadId}"}) { thread { id isResolved } } }`,
          ],
        }

      case 'POST_COMMENT':
        return {
          command: 'gh',
          args: [
            'api',
            '--method',
            'POST',
            `repos/${context.projectPath}/issues/${context.mrNumber}/comments`,
            '--field',
            `body=${action.body}`,
          ],
        }

      case 'THREAD_REPLY':
        return {
          command: 'gh',
          args: [
            'api',
            '--method',
            'POST',
            `repos/${context.projectPath}/pulls/${context.mrNumber}/comments/${action.threadId}/replies`,
            '--field',
            `body=${action.message}`,
          ],
        }

      case 'ADD_LABEL':
        return {
          command: 'gh',
          args: [
            'api',
            '--method',
            'POST',
            `repos/${context.projectPath}/issues/${context.mrNumber}/labels`,
            '--field',
            `labels[]=${action.label}`,
          ],
        }

      case 'POST_INLINE_COMMENT': {
        if (!context.diffMetadata) return null
        return {
          command: 'gh',
          args: [
            'api', '--method', 'POST',
            `repos/${context.projectPath}/pulls/${context.mrNumber}/comments`,
            '--field', `body=${action.body}`,
            '--field', `commit_id=${context.diffMetadata.headSha}`,
            '--field', `path=${action.filePath}`,
            '--field', `line=${action.line}`,
          ],
        }
      }

      case 'FETCH_THREADS':
        return null
    }
  }
}
