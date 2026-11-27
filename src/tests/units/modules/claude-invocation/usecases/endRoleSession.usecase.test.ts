import { beforeEach, describe, expect, it } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import { EndRoleSessionUseCase } from '@/modules/claude-invocation/usecases/endRoleSession.usecase.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubRoleSessionGateway } from '@/tests/stubs/roleSession.stub.js';
import { InMemoryRoleSessionJobGateway } from '@/tests/stubs/roleSessionJob.stub.js';

const worktreeRoot = '/home/ai/.reviewflow/worktrees';

describe('EndRoleSessionUseCase', () => {
  let roleSessionGateway: StubRoleSessionGateway;
  let sessionGateway: StubClaudeSessionGateway;
  let useCase: EndRoleSessionUseCase;

  beforeEach(() => {
    roleSessionGateway = new StubRoleSessionGateway();
    sessionGateway = new StubClaudeSessionGateway();
    useCase = new EndRoleSessionUseCase({
      roleSessionGateway,
      roleSessionJobGateway: new InMemoryRoleSessionJobGateway(),
      sessionGateway,
      worktreeRoot,
      now: () => new Date('2026-11-27T12:00:00.000Z'),
    });
    roleSessionGateway.listBackground([
      {
        sessionId: parseSessionId('a1b2c3d4'),
        name: 'Revue #2111 · lot bugs',
        cwd: `${worktreeRoot}/github-acme-app-2111`,
        startedAt: null,
        state: 'working',
      },
    ]);
  });

  it('stops then removes a live role session and gives its name', async () => {
    const result = await useCase.execute({ sessionId: 'a1b2c3d4' });

    expect(result).toEqual({ status: 'removed', name: 'Revue #2111 · lot bugs' });
    expect(sessionGateway.stopCalls).toEqual(['a1b2c3d4']);
    expect(sessionGateway.removeCalls).toEqual(['a1b2c3d4']);
  });

  it('reports a session Claude no longer lists as already gone, without touching it', async () => {
    const result = await useCase.execute({ sessionId: 'gone0001' });

    expect(result).toEqual({ status: 'already-gone' });
    expect(sessionGateway.stopCalls).toEqual([]);
    expect(sessionGateway.removeCalls).toEqual([]);
  });

  it('refuses to end a session that is not a role session', async () => {
    roleSessionGateway.listBackground([
      {
        sessionId: parseSessionId('human001'),
        name: 'Notes',
        cwd: '/home/ai',
        startedAt: null,
        state: 'working',
      },
    ]);

    const result = await useCase.execute({ sessionId: 'human001' });

    expect(result).toEqual({
      status: 'failed',
      reason: 'session human001 (Notes) is not a role session',
    });
    expect(sessionGateway.removeCalls).toEqual([]);
  });

  it('fails without touching anything when Claude sessions cannot be listed', async () => {
    roleSessionGateway.failListing('daemon down');

    const result = await useCase.execute({ sessionId: 'a1b2c3d4' });

    expect(result).toEqual({
      status: 'failed',
      reason: 'cannot list Claude sessions: daemon down',
    });
    expect(sessionGateway.removeCalls).toEqual([]);
  });

  it('still removes a session whose stop fails because it already exited', async () => {
    sessionGateway.setStopResult({ success: false, warning: 'session is not running' });

    const result = await useCase.execute({ sessionId: 'a1b2c3d4' });

    expect(result).toEqual({ status: 'removed', name: 'Revue #2111 · lot bugs' });
  });

  it('fails with the reason when the session cannot be removed', async () => {
    sessionGateway.setRemoveResult({ success: false, warning: 'worktree has unpushed commits' });

    const result = await useCase.execute({ sessionId: 'a1b2c3d4' });

    expect(result).toEqual({
      status: 'failed',
      reason: 'Revue #2111 · lot bugs not removed: remove: worktree has unpushed commits',
    });
  });
});
