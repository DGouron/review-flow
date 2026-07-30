import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';

export type PublicOutputAction = ReviewAction;

export interface PublicOutputContext {
  projectPath: string;
  mrNumber: number;
}

function publicOutputBody(action: ReviewAction): string | null {
  switch (action.type) {
    case 'POST_COMMENT':
      return action.body;
    case 'THREAD_REPLY':
      return action.message;
    default:
      return null;
  }
}

export function isPublicOutputAction(action: ReviewAction): boolean {
  return publicOutputBody(action) !== null;
}

/**
 * Every public-output body goes through the scanned sink, but the destination differs:
 * a THREAD_REPLY belongs inside its thread. Posting it as a top-level note would keep
 * the scan and lose the conversation it answers.
 */
export async function executePublicOutput(
  actions: PublicOutputAction[],
  context: PublicOutputContext,
  postGateway: NoteCommentPostGateway,
): Promise<void> {
  for (const action of actions) {
    const body = publicOutputBody(action);
    if (body === null) {
      continue;
    }

    if (action.type === 'THREAD_REPLY') {
      await postGateway.postThreadReply({
        projectPath: context.projectPath,
        mrNumber: context.mrNumber,
        threadId: action.threadId,
        body,
      });
      continue;
    }

    await postGateway.postComment({
      projectPath: context.projectPath,
      mrNumber: context.mrNumber,
      body,
    });
  }
}
