import { execSync } from 'node:child_process';

import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import { filterAutoExecutorActions } from '@/modules/platform-integration/services/autoExecutorActionFilter.js';
import type {
  ExecutionResult,
  CommandExecutor,
  ExecutionContext as GatewayExecutionContext,
} from '@/modules/review-execution/entities/reviewAction/reviewAction.gateway.js';
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import type { DiffMetadata } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import { GitHubReviewActionCliGateway } from '@/modules/review-execution/interface-adapters/gateways/cli/reviewAction.github.cli.gateway.js';
import { GitLabReviewActionCliGateway } from '@/modules/review-execution/interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.js';
import {
  executePublicOutput,
  isPublicOutputAction,
} from '@/modules/review-execution/services/publicOutputExecutor.js';

const COMMAND_TIMEOUT_MS = 30000;

/**
 * @deprecated Use ReviewAction instead
 */
export type ThreadAction = ReviewAction;

export interface ExecutionContext {
  platform: 'gitlab' | 'github';
  projectPath: string;
  mrNumber: number;
  localPath: string;
  diffMetadata?: DiffMetadata;
}

export type { ExecutionResult, CommandExecutor };

export interface ExecuteThreadActionsOptions {
  /**
   * Skip the auto-path capability filter (SPEC-196). Set by the constrained
   * dispatch chokepoint (SPEC-198), where provenance + authenticated-inventory
   * validation has already bounded the surface and must NOT be re-narrowed by
   * the auto-path read+postComment gate.
   */
  skipAutoCapabilityFilter?: boolean;
}

interface Logger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
  debug: (obj: object, msg: string) => void;
}

/**
 * @deprecated Use GitLabReviewActionCliGateway or GitHubReviewActionCliGateway directly
 */
export async function executeThreadActions(
  actions: ThreadAction[],
  context: ExecutionContext,
  logger: Logger,
  executor: CommandExecutor,
  postGateway: NoteCommentPostGateway | null = null,
  options: ExecuteThreadActionsOptions = {},
): Promise<ExecutionResult> {
  const gatewayContext: GatewayExecutionContext = {
    projectPath: context.projectPath,
    mrNumber: context.mrNumber,
    localPath: context.localPath,
    diffMetadata: context.diffMetadata,
    baseUrl: null,
  };

  let effectiveActions = actions;
  if (!options.skipAutoCapabilityFilter) {
    const { allowed, dropped } = filterAutoExecutorActions(actions);
    if (dropped.length > 0) {
      logger.warn(
        { droppedTypes: dropped.map((action) => action.type) },
        'Auto executor dropped write-capable actions outside the read+postComment capability set',
      );
    }
    effectiveActions = allowed;
  }

  const gateway =
    context.platform === 'gitlab'
      ? new GitLabReviewActionCliGateway(executor)
      : new GitHubReviewActionCliGateway(executor);

  if (postGateway === null) {
    return gateway.execute(effectiveActions, gatewayContext);
  }

  const publicOutputActions = effectiveActions.filter(isPublicOutputAction);
  const remainingActions = effectiveActions.filter((action) => !isPublicOutputAction(action));

  await executePublicOutput(
    publicOutputActions,
    { projectPath: context.projectPath, mrNumber: context.mrNumber },
    postGateway,
  );

  const cliResult = await gateway.execute(remainingActions, gatewayContext);

  return {
    total: effectiveActions.length,
    succeeded: cliResult.succeeded + publicOutputActions.length,
    failed: cliResult.failed,
    skipped: cliResult.skipped,
  };
}

export const defaultCommandExecutor: CommandExecutor = (
  command: string,
  args: string[],
  cwd: string,
): void => {
  execSync(`${command} ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd,
    encoding: 'utf-8',
    timeout: COMMAND_TIMEOUT_MS,
  });
};
