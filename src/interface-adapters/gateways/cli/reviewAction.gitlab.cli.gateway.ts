import type { ReviewAction } from '@/entities/reviewAction/reviewAction.js'
import type { ReviewActionGateway, ExecutionContext } from '@/entities/reviewAction/reviewAction.gateway.js'
import { ExecutionGatewayBase, type CommandInfo } from '@/shared/foundation/executionGateway.base.js'
import { enrichCommentWithLinks } from '@/services/commentLinkEnricher.js'

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

      case 'POST_COMMENT': {
        const enrichedBody = context.baseUrl && context.diffMetadata
          ? enrichCommentWithLinks(action.body, context.baseUrl, context.projectPath, context.diffMetadata.headSha)
          : action.body
        return {
          command: 'glab',
          args: ['api', '--method', 'POST', `${baseUrl}/notes`, '--field', `body=${enrichedBody}`],
        }
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

      case 'POST_INLINE_COMMENT': {
        if (!context.diffMetadata) return null
        return {
          command: 'glab',
          args: [
            'api', '--method', 'POST',
            `${baseUrl}/discussions`,
            '--field', `body=${action.body}`,
            '--field', `position[base_sha]=${context.diffMetadata.baseSha}`,
            '--field', `position[head_sha]=${context.diffMetadata.headSha}`,
            '--field', `position[start_sha]=${context.diffMetadata.startSha}`,
            '--field', 'position[position_type]=text',
            '--field', `position[new_path]=${action.filePath}`,
            '--field', `position[old_path]=${action.filePath}`,
            '--field', `position[new_line]=${action.line}`,
          ],
        }
      }

      case 'FETCH_THREADS':
        return null
    }
  }
}
