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
    await postGateway.postComment({
      projectPath: context.projectPath,
      mrNumber: context.mrNumber,
      body,
    });
  }
}
