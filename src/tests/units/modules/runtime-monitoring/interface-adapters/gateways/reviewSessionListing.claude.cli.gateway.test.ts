import { describe, expect, it } from 'vitest';

import { ReviewSessionListingClaudeCliGateway } from '@/modules/runtime-monitoring/interface-adapters/gateways/reviewSessionListing.claude.cli.gateway.js';

const WORKTREE_ROOT = '/home/ai/.reviewflow/worktrees';

function gatewayReturning(stdout: string, exitCode = 0) {
  return new ReviewSessionListingClaudeCliGateway(
    async () => ({ stdout, exitCode }),
    WORKTREE_ROOT,
  );
}

function agent(overrides: Record<string, unknown>) {
  return {
    id: 'a1b2c3d4',
    kind: 'background',
    pid: 4100,
    cwd: `${WORKTREE_ROOT}/github-acme-app-1526`,
    startedAt: Date.parse('2026-11-26T09:00:00Z'),
    status: 'idle',
    ...overrides,
  };
}

describe('ReviewSessionListingClaudeCliGateway', () => {
  it('lists the sessions running in a review worktree with their main process', async () => {
    const gateway = gatewayReturning(JSON.stringify([agent({})]));

    expect(await gateway.list()).toEqual([
      {
        sessionId: 'a1b2c3d4',
        worktree: 'github-acme-app-1526',
        mainPid: 4100,
        startedAt: '2026-11-26T09:00:00.000Z',
      },
    ]);
  });

  it('names the session after the worktree folder even from a sub-directory', async () => {
    const gateway = gatewayReturning(
      JSON.stringify([agent({ cwd: `${WORKTREE_ROOT}/gitlab-acme-api-7/packages/core` })]),
    );

    const sessions = await gateway.list();

    expect(sessions?.[0].worktree).toBe('gitlab-acme-api-7');
  });

  it('ignores Claude sessions outside the review worktrees', async () => {
    const gateway = gatewayReturning(
      JSON.stringify([
        agent({ id: 'foreign', cwd: '/home/ai/projects/app' }),
        agent({ id: 'sibling', cwd: `${WORKTREE_ROOT}-backup/github-acme-app-1` }),
        agent({ id: 'root', cwd: WORKTREE_ROOT }),
      ]),
    );

    expect(await gateway.list()).toEqual([]);
  });

  it('skips entries without a usable process id and keeps a missing start time as null', async () => {
    const gateway = gatewayReturning(
      JSON.stringify([
        agent({ id: 'nopid', pid: undefined }),
        agent({ id: 'nostart', startedAt: undefined }),
      ]),
    );

    expect(await gateway.list()).toEqual([
      { sessionId: 'nostart', worktree: 'github-acme-app-1526', mainPid: 4100, startedAt: null },
    ]);
  });

  it('reports a failed listing when the CLI exits with an error', async () => {
    expect(await gatewayReturning('', 1).list()).toBeNull();
  });

  it('reports a failed listing when the CLI output is not a session list', async () => {
    expect(await gatewayReturning('not json').list()).toBeNull();
    expect(await gatewayReturning('{"id":"x"}').list()).toBeNull();
  });

  it('reports a failed listing when the CLI cannot be started', async () => {
    const gateway = new ReviewSessionListingClaudeCliGateway(async () => {
      throw new Error('spawn claude ENOENT');
    }, WORKTREE_ROOT);

    expect(await gateway.list()).toBeNull();
  });
});
