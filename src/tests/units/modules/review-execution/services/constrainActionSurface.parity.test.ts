import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import { constrainActionSurface } from '@/modules/review-execution/services/constrainActionSurface.js';
import { parseThreadActions } from '@/modules/review-execution/services/threadActionsParser.js';

describe('AC-3 parser drops non-allowlisted token types', () => {
  it('parses only allowlisted markers and ignores unknown ones', () => {
    const stdout = '[UNKNOWN:1] [DROP_DB] [POST_COMMENT:hello]';
    const parsed = parseThreadActions(stdout);
    expect(parsed).toEqual([{ type: 'POST_COMMENT', body: 'hello' }]);
  });
});

describe('AC-4 stdout / context-file parity', () => {
  it('produces a byte-identical constrained set whichever path the actions arrive from', () => {
    const stdoutActions = parseThreadActions(
      '[THREAD_RESOLVE:10][THREAD_REPLY:999:nope][POST_COMMENT:hi][FETCH_THREADS]',
    );
    const contextFileActions: ReviewAction[] = [
      { type: 'THREAD_RESOLVE', threadId: '10' },
      { type: 'THREAD_REPLY', threadId: '999', message: 'nope' },
      { type: 'POST_COMMENT', body: 'hi' },
      { type: 'FETCH_THREADS' },
    ];

    const constraints = {
      provenance: 'untrusted' as const,
      threadInventory: new Set(['10']),
    };

    const fromStdout = constrainActionSurface(stdoutActions, constraints);
    const fromContextFile = constrainActionSurface(contextFileActions, constraints);

    expect(fromStdout).toEqual(fromContextFile);
    expect(fromStdout).toEqual([{ type: 'POST_COMMENT', body: 'hi' }]);
  });
});
