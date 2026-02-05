import type { ReviewAction } from '../../../entities/reviewAction/reviewAction.js'
import type { ReviewActionGateway, ExecutionContext } from '../../../entities/reviewAction/reviewAction.gateway.js'
import { ExecutionGatewayBase, type CommandInfo } from '../../../shared/foundation/executionGateway.base.js'

export class GitLabReviewActionCliGateway
  extends ExecutionGatewayBase<ReviewAction, ExecutionContext>
  implements ReviewActionGateway
{
  protected buildCommand(action: ReviewAction, context: ExecutionContext): CommandInfo | null {
    const encodedProject = context.projectPath.replace(/\//g, '%2F')
    const baseUrl = `projects/${encodedProject}/merge_requests/${context.mrNumber}`

    switch (action.type) {
      case 'THREAD_RESOLVE':
        return {
          command: 'glab',
          args: ['api', '--method', 'PUT', `${baseUrl}/discussions/${action.threadId}`, '--field', 'resolved=true'],
        }

      case 'POST_COMMENT':
        return {
          command: 'glab',
          args: ['api', '--method', 'POST', `${baseUrl}/notes`, '--field', `body=${action.body}`],
        }

      case 'THREAD_REPLY':
        return {
          command: 'glab',
          args: [
            'api',
            '--method',
            'POST',
            `${baseUrl}/discussions/${action.threadId}/notes`,
            '--field',
            `body=${action.message}`,
          ],
        }

      case 'ADD_LABEL':
        return {
          command: 'glab',
          args: ['api', '--method', 'PUT', baseUrl, '--field', `add_labels=${action.label}`],
        }

      case 'FETCH_THREADS':
        return null
    }
  }
}
