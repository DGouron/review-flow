import { AUTO_EXECUTOR_CAPABILITIES } from '@/modules/platform-integration/entities/executorToken/executorCapability.js';
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';

export type ActionCapability = 'readMr' | 'postComment' | 'threadResolve' | 'revoke' | 'addLabel';

export function capabilityForAction(action: ReviewAction): ActionCapability {
  switch (action.type) {
    case 'FETCH_THREADS':
      return 'readMr';
    case 'POST_COMMENT':
    case 'THREAD_REPLY':
    case 'POST_INLINE_COMMENT':
      return 'postComment';
    case 'THREAD_RESOLVE':
      return 'threadResolve';
    case 'ADD_LABEL':
      return 'addLabel';
  }
}

export interface AutoExecutorActionFilterResult {
  allowed: ReviewAction[];
  dropped: ReviewAction[];
}

function isAutoCapability(capability: ActionCapability): boolean {
  return (
    (capability === 'readMr' || capability === 'postComment') &&
    AUTO_EXECUTOR_CAPABILITIES.has(capability)
  );
}

export function filterAutoExecutorActions(actions: ReviewAction[]): AutoExecutorActionFilterResult {
  const allowed: ReviewAction[] = [];
  const dropped: ReviewAction[] = [];

  for (const action of actions) {
    if (isAutoCapability(capabilityForAction(action))) {
      allowed.push(action);
    } else {
      dropped.push(action);
    }
  }

  return { allowed, dropped };
}
