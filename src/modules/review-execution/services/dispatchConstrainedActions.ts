import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { Provenance } from '@/modules/review-execution/entities/actionProvenance/actionProvenance.js';
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import type { ThreadInventoryGateway } from '@/modules/review-execution/entities/threadInventory/threadInventory.gateway.js';
import { constrainActionSurface } from '@/modules/review-execution/services/constrainActionSurface.js';
import { resolveThreadInventory } from '@/modules/review-execution/services/resolveThreadInventory.js';
import {
  executeThreadActions,
  type ExecutionContext,
  type ExecutionResult,
  type CommandExecutor,
} from '@/modules/review-execution/services/threadActionsExecutor.js';

interface DispatchLogger {
  info: (obj: object, message: string) => void;
  warn: (obj: object, message: string) => void;
  error: (obj: object, message: string) => void;
  debug: (obj: object, message: string) => void;
}

export interface DispatchOptions {
  context: ExecutionContext;
  provenance: Provenance;
  inventoryGateway: ThreadInventoryGateway;
  logger: DispatchLogger;
  executor: CommandExecutor;
  postGateway?: NoteCommentPostGateway | null;
}

/**
 * Single chokepoint between parsed LLM actions and live write commands.
 *
 * Resolves the authenticated MR thread inventory (fail-closed), bounds the action
 * surface against provenance + that inventory, then dispatches only the surviving
 * actions to the executor. Forged or out-of-MR thread ids never reach a live write.
 * Public-output verbs that survive are routed through the scanned post sink.
 */
export async function dispatchConstrainedActions(
  actions: ReviewAction[],
  options: DispatchOptions,
): Promise<ExecutionResult> {
  const { context, provenance, inventoryGateway, logger, executor, postGateway = null } = options;

  const threadInventory = resolveThreadInventory(
    inventoryGateway,
    { projectPath: context.projectPath, mrNumber: context.mrNumber },
    logger,
  );

  const constrained = constrainActionSurface(actions, { provenance, threadInventory });

  return executeThreadActions(constrained, context, logger, executor, postGateway, {
    skipAutoCapabilityFilter: true,
  });
}
