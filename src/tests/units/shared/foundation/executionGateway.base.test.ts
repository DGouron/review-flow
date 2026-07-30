import { describe, it, expect } from 'vitest';

import {
  ExecutionGatewayBase,
  type CommandInfo,
} from '@/shared/foundation/executionGateway.base.js';

type StubAction = { type: string; skip?: boolean };

class StubExecutionGateway extends ExecutionGatewayBase<StubAction, { localPath: string }> {
  protected buildCommand(action: StubAction): CommandInfo | null {
    if (action.skip) {
      return null;
    }
    return { command: 'stub', args: [action.type] };
  }
}

describe('ExecutionGatewayBase', () => {
  it('reports the failing action type and the command error message', async () => {
    const gateway = new StubExecutionGateway(() => {
      throw new Error('gh: Could not resolve to a node with the global id');
    });

    const result = await gateway.execute([{ type: 'THREAD_RESOLVE' }], { localPath: '/tmp/repo' });

    expect(result.failed).toBe(1);
    expect(result.outcomes).toEqual([
      {
        type: 'THREAD_RESOLVE',
        status: 'failed',
        message: 'gh: Could not resolve to a node with the global id',
      },
    ]);
  });

  it('records one outcome per action, succeeded and skipped included', async () => {
    const gateway = new StubExecutionGateway(() => {});

    const result = await gateway.execute(
      [{ type: 'THREAD_RESOLVE' }, { type: 'POST_INLINE_COMMENT', skip: true }],
      { localPath: '/tmp/repo' },
    );

    expect(result.outcomes).toEqual([
      { type: 'THREAD_RESOLVE', status: 'succeeded' },
      { type: 'POST_INLINE_COMMENT', status: 'skipped' },
    ]);
    expect(result.outcomes).toHaveLength(result.total);
  });
});
