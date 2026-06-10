import { describe, it, expect } from 'vitest';

import {
  filterAutoExecutorActions,
  capabilityForAction,
} from '@/modules/platform-integration/services/autoExecutorActionFilter.js';
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';

describe('auto executor action filter (AC6/AC7)', () => {
  it('maps each action type to its required capability (AC5)', () => {
    expect(capabilityForAction({ type: 'FETCH_THREADS' })).toBe('readMr');
    expect(capabilityForAction({ type: 'POST_COMMENT', body: 'x' })).toBe('postComment');
    expect(capabilityForAction({ type: 'THREAD_REPLY', threadId: '1', message: 'x' })).toBe(
      'postComment',
    );
    expect(
      capabilityForAction({ type: 'POST_INLINE_COMMENT', filePath: 'a', line: 1, body: 'x' }),
    ).toBe('postComment');
    expect(capabilityForAction({ type: 'THREAD_RESOLVE', threadId: '1' })).toBe('threadResolve');
    expect(capabilityForAction({ type: 'ADD_LABEL', label: 'x' })).toBe('addLabel');
  });

  it('AC6: drops THREAD_RESOLVE from the auto action set', () => {
    const actions: ReviewAction[] = [
      { type: 'POST_COMMENT', body: 'hello' },
      { type: 'THREAD_RESOLVE', threadId: '42' },
    ];
    const { allowed, dropped } = filterAutoExecutorActions(actions);
    expect(allowed).toEqual([{ type: 'POST_COMMENT', body: 'hello' }]);
    expect(dropped).toEqual([{ type: 'THREAD_RESOLVE', threadId: '42' }]);
  });

  it('AC7: keeps POST_COMMENT and FETCH_THREADS, drops THREAD_RESOLVE, no throw', () => {
    const actions: ReviewAction[] = [
      { type: 'POST_COMMENT', body: 'one' },
      { type: 'THREAD_RESOLVE', threadId: '7' },
      { type: 'FETCH_THREADS' },
    ];
    const { allowed, dropped } = filterAutoExecutorActions(actions);
    expect(allowed).toEqual([{ type: 'POST_COMMENT', body: 'one' }, { type: 'FETCH_THREADS' }]);
    expect(dropped).toEqual([{ type: 'THREAD_RESOLVE', threadId: '7' }]);
  });

  it('AC6: drops ADD_LABEL since it exceeds the read+postComment set', () => {
    const actions: ReviewAction[] = [{ type: 'ADD_LABEL', label: 'reviewed' }];
    const { allowed, dropped } = filterAutoExecutorActions(actions);
    expect(allowed).toEqual([]);
    expect(dropped).toEqual([{ type: 'ADD_LABEL', label: 'reviewed' }]);
  });
});
