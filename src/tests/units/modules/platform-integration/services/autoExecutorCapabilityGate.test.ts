import { describe, it, expect } from 'vitest';

import {
  EXECUTOR_CAPABILITY_TABLE,
  AUTO_EXECUTOR_CAPABILITIES,
} from '@/modules/platform-integration/entities/executorToken/executorCapability.js';
import {
  capabilityForAction,
  filterAutoExecutorActions,
} from '@/modules/platform-integration/services/autoExecutorActionFilter.js';
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import { reviewActionSchema } from '@/modules/review-execution/entities/reviewAction/reviewAction.schema.js';

// AC8 — merge-blocking privilege contract gate.
// This structural test pins the production auto-executor capability set to exactly
// {readMr, postComment}. Re-wiring revoke/THREAD_RESOLVE into the auto path, or
// widening the token's capability set, turns this red.
describe('auto executor capability gate (AC8)', () => {
  it('freezes the auto capability set to exactly {readMr, postComment}', () => {
    expect([...AUTO_EXECUTOR_CAPABILITIES].toSorted()).toEqual(['postComment', 'readMr']);
  });

  it('keeps threadResolve and revoke declared as non-auto in the source-of-truth table', () => {
    expect(EXECUTOR_CAPABILITY_TABLE.threadResolve.autoPath).toBe(false);
    expect(EXECUTOR_CAPABILITY_TABLE.revoke.autoPath).toBe(false);
  });

  it('lets every parseable review action verb through the production filter only if its capability is auto', () => {
    const sampleByType: Record<string, ReviewAction> = {
      FETCH_THREADS: { type: 'FETCH_THREADS' },
      POST_COMMENT: { type: 'POST_COMMENT', body: 'b' },
      THREAD_REPLY: { type: 'THREAD_REPLY', threadId: '1', message: 'm' },
      POST_INLINE_COMMENT: { type: 'POST_INLINE_COMMENT', filePath: 'f', line: 1, body: 'b' },
      THREAD_RESOLVE: { type: 'THREAD_RESOLVE', threadId: '1' },
      ADD_LABEL: { type: 'ADD_LABEL', label: 'l' },
    };

    const allUnionTypes = reviewActionSchema.options.map((option) => option.shape.type.value);
    // Guard: the gate must cover every verb the schema can parse.
    expect(Object.keys(sampleByType).toSorted()).toEqual([...allUnionTypes].toSorted());

    const actions = Object.values(sampleByType);
    const { allowed, dropped } = filterAutoExecutorActions(actions);

    const autoVerbs = ['FETCH_THREADS', 'POST_COMMENT', 'THREAD_REPLY', 'POST_INLINE_COMMENT'];
    const nonAutoVerbs = ['THREAD_RESOLVE', 'ADD_LABEL'];

    expect(allowed.map((a) => a.type).toSorted()).toEqual([...autoVerbs].toSorted());
    expect(dropped.map((a) => a.type).toSorted()).toEqual([...nonAutoVerbs].toSorted());

    for (const action of allowed) {
      expect(['readMr', 'postComment']).toContain(capabilityForAction(action));
    }
  });
});
