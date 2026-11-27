import { beforeEach, describe, expect, it } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { BackgroundSession } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import { SweepRoleSessionsUseCase } from '@/modules/claude-invocation/usecases/sweepRoleSessions.usecase.js';
import { RoleSessionJobFactory } from '@/tests/factories/roleSessionJob.factory.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubRoleSessionGateway } from '@/tests/stubs/roleSession.stub.js';
import { InMemoryRoleSessionJobGateway } from '@/tests/stubs/roleSessionJob.stub.js';

const now = new Date('2026-11-27T12:00:00.000Z');
const worktreeRoot = '/home/ai/.reviewflow/worktrees';
const jobId = 'github:acme/app:2111';

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

function roleSession(id: string, startedAt: Date | null): BackgroundSession {
  return {
    sessionId: parseSessionId(id),
    name: 'Revue #2111 · lot bugs',
    cwd: `${worktreeRoot}/github-acme-app-2111`,
    startedAt,
    state: 'working',
  };
}

describe('SweepRoleSessionsUseCase', () => {
  let roleSessionGateway: StubRoleSessionGateway;
  let roleSessionJobGateway: InMemoryRoleSessionJobGateway;
  let sessionGateway: StubClaudeSessionGateway;
  let useCase: SweepRoleSessionsUseCase;

  beforeEach(() => {
    roleSessionGateway = new StubRoleSessionGateway();
    roleSessionJobGateway = new InMemoryRoleSessionJobGateway();
    sessionGateway = new StubClaudeSessionGateway();
    useCase = new SweepRoleSessionsUseCase({
      roleSessionGateway,
      roleSessionJobGateway,
      sessionGateway,
      worktreeRoot,
      now: () => now,
      reviewTimeoutMs: () => reviewTimeoutMs,
    });
  });

  let reviewTimeoutMs = 15 * 60_000;

  it('lets a role session of an active job live as long as the review timeout', async () => {
    reviewTimeoutMs = 480 * 60_000;
    recordForActiveJob('longrev1', minutesAgo(300));
    roleSessionGateway.listBackground([roleSession('longrev1', minutesAgo(300))]);

    const result = await useCase.execute({ dryRun: false });

    expect(result.status === 'swept' && result.outcomes[0]?.action).toBe('kept');
    reviewTimeoutMs = 15 * 60_000;
  });

  it('keeps a role session launched a moment ago that is not recorded yet', async () => {
    roleSessionGateway.listBackground([roleSession('justnow1', minutesAgo(1))]);

    const result = await useCase.execute({ dryRun: false });

    expect(result.status === 'swept' && result.outcomes[0]?.action).toBe('kept');
    expect(sessionGateway.removeCalls).toEqual([]);
  });

  function recordForActiveJob(sessionId: string, launchedAt: Date): void {
    roleSessionJobGateway.save(
      RoleSessionJobFactory.create({
        jobId,
        roleSessions: [
          {
            sessionId: parseSessionId(sessionId),
            role: 'lot:bugs',
            launchedAt: launchedAt.toISOString(),
          },
        ],
      }),
    );
  }

  it('removes a role session no active job records', async () => {
    roleSessionGateway.listBackground([roleSession('orphan01', minutesAgo(5))]);

    const result = await useCase.execute({ dryRun: false });

    expect(result).toEqual({
      status: 'swept',
      outcomes: [
        {
          sessionId: 'orphan01',
          name: 'Revue #2111 · lot bugs',
          action: 'removed',
          reason: 'job no longer active',
        },
      ],
    });
    expect(sessionGateway.removeCalls).toEqual(['orphan01']);
  });

  it('keeps a recent role session of an active job', async () => {
    recordForActiveJob('active01', minutesAgo(10));
    roleSessionGateway.listBackground([roleSession('active01', minutesAgo(10))]);

    const result = await useCase.execute({ dryRun: false });

    expect(result.status === 'swept' && result.outcomes[0]?.action).toBe('kept');
    expect(sessionGateway.removeCalls).toEqual([]);
  });

  it('uses the recorded launch time when Claude does not give the start time', async () => {
    recordForActiveJob('oldrole1', minutesAgo(150));
    roleSessionGateway.listBackground([roleSession('oldrole1', null)]);

    const result = await useCase.execute({ dryRun: false });

    expect(result.status === 'swept' && result.outcomes[0]?.reason).toBe(
      'started more than 2 hours ago',
    );
  });

  it('says what it would remove on a dry run and removes nothing', async () => {
    roleSessionGateway.listBackground([roleSession('orphan01', minutesAgo(5))]);

    const result = await useCase.execute({ dryRun: true });

    expect(result.status === 'swept' && result.outcomes[0]?.action).toBe('would-remove');
    expect(sessionGateway.stopCalls).toEqual([]);
    expect(sessionGateway.removeCalls).toEqual([]);
  });

  it('reports a session it could not remove and goes on with the next one', async () => {
    sessionGateway.setRemoveResult({ success: false, warning: 'busy' });
    roleSessionGateway.listBackground([
      roleSession('orphan01', minutesAgo(5)),
      roleSession('orphan02', minutesAgo(5)),
    ]);

    const result = await useCase.execute({ dryRun: false });

    expect(result.status === 'swept' && result.outcomes.map((outcome) => outcome.action)).toEqual([
      'failed',
      'failed',
    ]);
    expect(result.status === 'swept' && result.outcomes[0]?.reason).toBe(
      'job no longer active; remove: busy',
    );
  });

  it('ignores sessions that are not role sessions', async () => {
    roleSessionGateway.listBackground([
      { ...roleSession('review01', minutesAgo(500)), name: null },
      { ...roleSession('human001', minutesAgo(500)), cwd: '/home/ai/projects/app' },
    ]);

    const result = await useCase.execute({ dryRun: false });

    expect(result).toEqual({ status: 'swept', outcomes: [] });
  });

  it('fails when Claude sessions cannot be listed', async () => {
    roleSessionGateway.failListing('daemon down');

    const result = await useCase.execute({ dryRun: false });

    expect(result).toEqual({
      status: 'failed',
      reason: 'cannot list Claude sessions: daemon down',
    });
  });
});
