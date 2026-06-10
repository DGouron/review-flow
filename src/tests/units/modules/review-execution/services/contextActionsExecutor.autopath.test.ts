import { describe, it, expect } from 'vitest';

import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';

class RecordingCommandExecutor {
  public readonly calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  run = (command: string, args: string[], cwd: string): void => {
    this.calls.push({ command, args, cwd });
  };
}

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

function buildContext(actions: ReviewContext['actions']): ReviewContext {
  return {
    localPath: '/repo',
    mergeRequestId: 'gitlab-group/proj-5',
    platform: 'gitlab',
    projectPath: 'group/proj',
    mergeRequestNumber: 5,
    threads: [],
    agents: [],
    actions,
    diffMetadata: undefined,
  } as unknown as ReviewContext;
}

describe('auto path context executor blocks write verbs (AC6/AC7)', () => {
  it('AC6: never sends a THREAD_RESOLVE command to the executor', async () => {
    const executor = new RecordingCommandExecutor();
    const context = buildContext([
      { type: 'POST_COMMENT', body: 'hello' },
      { type: 'THREAD_RESOLVE', threadId: '42' },
    ]);

    await executeActionsFromContext(context, '/repo', silentLogger, executor.run, null);

    const resolveCalls = executor.calls.filter((c) =>
      c.args.some((a) => a.includes('discussions/42') && c.args.includes('resolved=true')),
    );
    expect(resolveCalls).toHaveLength(0);
  });

  it('AC7: still posts the comment and does not throw on a mixed verb stream', async () => {
    const executor = new RecordingCommandExecutor();
    const context = buildContext([
      { type: 'POST_COMMENT', body: 'one' },
      { type: 'THREAD_RESOLVE', threadId: '7' },
      { type: 'FETCH_THREADS' },
    ]);

    const result = await executeActionsFromContext(
      context,
      '/repo',
      silentLogger,
      executor.run,
      null,
    );

    const postCalls = executor.calls.filter((c) => c.args.some((a) => a.startsWith('body=')));
    expect(postCalls).toHaveLength(1);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});
