import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import { filterAutoExecutorActions } from '@/modules/platform-integration/services/autoExecutorActionFilter.js';
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import { GitHubReviewActionCliGateway } from '@/modules/review-execution/interface-adapters/gateways/cli/reviewAction.github.cli.gateway.js';
import { GitLabReviewActionCliGateway } from '@/modules/review-execution/interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.js';
import {
  executePublicOutput,
  isPublicOutputAction,
} from '@/modules/review-execution/services/publicOutputExecutor.js';
import type {
  CommandExecutor,
  ExecutionResult,
} from '@/shared/foundation/executionGateway.base.js';

/**
 * @deprecated Use ReviewContextAction from reviewAction entity instead
 */
export type { ReviewAction as ReviewContextAction };

/**
 * The auto-path capability filter drops THREAD_RESOLVE (it requires a privileged role).
 * Context actions, however, travel with `context.threads` — the authenticated thread inventory
 * written at job creation, never reachable by the LLM (which can only append to `actions` via MCP).
 * Re-admit a dropped THREAD_RESOLVE only when its target id belongs to that inventory, so genuine
 * resolves run while forged or out-of-MR ids stay dropped (fail-closed on an empty inventory).
 */
function selectExecutableContextActions(
  actions: ReviewAction[],
  authenticatedThreadIds: ReadonlySet<string>,
): { allowed: ReviewAction[]; dropped: ReviewAction[] } {
  const { allowed, dropped } = filterAutoExecutorActions(actions);

  const reinstated: ReviewAction[] = [];
  const stillDropped: ReviewAction[] = [];
  for (const action of dropped) {
    if (action.type === 'THREAD_RESOLVE' && authenticatedThreadIds.has(action.threadId.trim())) {
      reinstated.push({ ...action, threadId: action.threadId.trim() });
    } else {
      stillDropped.push(action);
    }
  }

  return { allowed: [...allowed, ...reinstated], dropped: stillDropped };
}

export type { ExecutionResult, CommandExecutor };

interface Logger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
  debug: (obj: object, msg: string) => void;
}

/**
 * @deprecated Use GitLabReviewActionCliGateway or GitHubReviewActionCliGateway directly
 */
export async function executeActionsFromContext(
  context: ReviewContext,
  localPath: string,
  logger: Logger,
  executor: CommandExecutor,
  baseUrl: string | null = null,
  postGateway: NoteCommentPostGateway | null = null,
): Promise<ExecutionResult> {
  const gatewayContext = {
    projectPath: context.projectPath,
    mrNumber: context.mergeRequestNumber,
    localPath,
    diffMetadata: context.diffMetadata,
    baseUrl,
  };

  const authenticatedThreadIds = new Set(context.threads.map((thread) => thread.id));
  const { allowed, dropped } = selectExecutableContextActions(
    context.actions,
    authenticatedThreadIds,
  );

  if (dropped.length > 0) {
    logger.warn(
      { droppedTypes: dropped.map((action) => action.type) },
      'Auto executor dropped write-capable actions outside the read+postComment capability set',
    );
  }

  const gateway =
    context.platform === 'gitlab'
      ? new GitLabReviewActionCliGateway(executor)
      : new GitHubReviewActionCliGateway(executor);

  if (postGateway === null) {
    return gateway.execute(allowed, gatewayContext);
  }

  const publicOutputActions = allowed.filter(isPublicOutputAction);
  const remainingActions = allowed.filter((action) => !isPublicOutputAction(action));

  await executePublicOutput(
    publicOutputActions,
    { projectPath: context.projectPath, mrNumber: context.mergeRequestNumber },
    postGateway,
  );

  const cliResult = await gateway.execute(remainingActions, gatewayContext);

  return {
    total: allowed.length,
    succeeded: cliResult.succeeded + publicOutputActions.length,
    failed: cliResult.failed,
    skipped: cliResult.skipped,
  };
}
