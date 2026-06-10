import type { Provenance } from '@/modules/review-execution/entities/actionProvenance/actionProvenance.js';
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';

export interface ActionSurfaceConstraints {
  provenance: Provenance;
  threadInventory: ReadonlySet<string>;
}

/**
 * Bounds the executable write surface derived from LLM output.
 *
 * - `POST_COMMENT` is always allowed (the only untrusted write verb).
 * - `FETCH_THREADS` is allowed only for `trusted` provenance (read-amplification gate).
 * - `THREAD_RESOLVE` / `THREAD_REPLY` require BOTH `trusted` provenance AND the (trimmed)
 *   target id being a member of the authenticated MR thread inventory.
 * - Any other verb is dropped.
 *
 * Membership is computed from the passed inventory only, never from token text.
 */
export function constrainActionSurface(
  actions: ReviewAction[],
  constraints: ActionSurfaceConstraints,
): ReviewAction[] {
  const { provenance, threadInventory } = constraints;
  const isTrusted = provenance === 'trusted';

  const constrained: ReviewAction[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'POST_COMMENT':
        constrained.push(action);
        break;

      case 'FETCH_THREADS':
        if (isTrusted) constrained.push(action);
        break;

      case 'THREAD_RESOLVE': {
        if (!isTrusted) break;
        const target = action.threadId.trim();
        if (threadInventory.has(target)) {
          constrained.push({ ...action, threadId: target });
        }
        break;
      }

      case 'THREAD_REPLY': {
        if (!isTrusted) break;
        const target = action.threadId.trim();
        if (threadInventory.has(target)) {
          constrained.push({ ...action, threadId: target });
        }
        break;
      }

      default:
        break;
    }
  }

  return constrained;
}
