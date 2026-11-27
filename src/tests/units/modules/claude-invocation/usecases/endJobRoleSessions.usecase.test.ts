import { beforeEach, describe, expect, it } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { SessionUsageSnapshot } from '@/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.js';
import {
  EndJobRoleSessionsUseCase,
  type RoleSessionUsage,
} from '@/modules/claude-invocation/usecases/endJobRoleSessions.usecase.js';
import { RoleSessionJobFactory } from '@/tests/factories/roleSessionJob.factory.js';
import { TokenUsageFactory } from '@/tests/factories/tokenUsage.factory.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { InMemoryRoleSessionJobGateway } from '@/tests/stubs/roleSessionJob.stub.js';

const jobId = 'github:acme/app:2111';
const cwd = '/home/ai/.reviewflow/worktrees/github-acme-app-2111';

function snapshotOf(sessionId: string): SessionUsageSnapshot {
  return { sessionId, model: 'claude-opus-4-7', turns: 3, usage: TokenUsageFactory.create() };
}

describe('EndJobRoleSessionsUseCase', () => {
  let roleSessionJobGateway: InMemoryRoleSessionJobGateway;
  let sessionGateway: StubClaudeSessionGateway;
  let recordedUsages: RoleSessionUsage[];
  let useCase: EndJobRoleSessionsUseCase;

  beforeEach(() => {
    roleSessionJobGateway = new InMemoryRoleSessionJobGateway();
    sessionGateway = new StubClaudeSessionGateway();
    recordedUsages = [];
    useCase = new EndJobRoleSessionsUseCase({
      roleSessionJobGateway,
      sessionGateway,
      recordRoleSessionUsage: async (usage) => {
        recordedUsages.push(usage);
      },
    });
    roleSessionJobGateway.save(
      RoleSessionJobFactory.create({
        jobId,
        roleSessions: [
          {
            sessionId: parseSessionId('greffe01'),
            role: 'greffe',
            launchedAt: '2026-11-27T11:00:00Z',
          },
          {
            sessionId: parseSessionId('arbitre1'),
            role: 'arbitre',
            launchedAt: '2026-11-27T11:30:00Z',
          },
        ],
      }),
    );
    roleSessionJobGateway.save(
      RoleSessionJobFactory.create({
        jobId: 'github:acme/app:9',
        roleSessions: [
          {
            sessionId: parseSessionId('other001'),
            role: 'greffe',
            launchedAt: '2026-11-27T11:00:00Z',
          },
        ],
      }),
    );
  });

  it('measures then ends each role session of the job, and only of that job', async () => {
    sessionGateway.setSessionUsageFor('greffe01', snapshotOf('greffe01-full'));
    sessionGateway.setSessionUsageFor('arbitre1', snapshotOf('arbitre1-full'));

    const result = await useCase.execute({ jobId, cwd });

    expect(recordedUsages).toEqual([
      { role: 'greffe', snapshot: snapshotOf('greffe01-full') },
      { role: 'arbitre', snapshot: snapshotOf('arbitre1-full') },
    ]);
    expect(sessionGateway.getSessionUsageCalls).toEqual([
      { sessionId: 'greffe01', cwd },
      { sessionId: 'arbitre1', cwd },
    ]);
    expect(sessionGateway.removeCalls).toEqual(['greffe01', 'arbitre1']);
    expect(result).toEqual({ ended: 2, warnings: [] });
  });

  it('ends a session whose usage is unknown without recording anything for it', async () => {
    sessionGateway.setSessionUsageFor('greffe01', null);
    sessionGateway.setSessionUsageFor('arbitre1', snapshotOf('arbitre1-full'));

    await useCase.execute({ jobId, cwd });

    expect(recordedUsages.map((usage) => usage.role)).toEqual(['arbitre']);
    expect(sessionGateway.removeCalls).toEqual(['greffe01', 'arbitre1']);
  });

  it('goes on with the next session when measuring, recording or ending one fails', async () => {
    sessionGateway.setSessionUsageError('greffe01', new Error('transcript unreadable'));
    sessionGateway.setSessionUsageFor('arbitre1', snapshotOf('arbitre1-full'));
    sessionGateway.setRemoveError(new Error('daemon gone'));
    useCase = new EndJobRoleSessionsUseCase({
      roleSessionJobGateway,
      sessionGateway,
      recordRoleSessionUsage: async () => {
        throw new Error('disk full');
      },
    });

    const result = await useCase.execute({ jobId, cwd });

    expect(sessionGateway.removeCalls).toEqual(['greffe01', 'arbitre1']);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'greffe01: usage not measured: transcript unreadable',
        'greffe01: remove failed: daemon gone',
        'arbitre1: usage not recorded: disk full',
        'arbitre1: remove failed: daemon gone',
      ]),
    );
    expect(result.ended).toBe(0);
  });

  it('does nothing for a job without role sessions', async () => {
    const result = await useCase.execute({ jobId: 'github:acme/app:404', cwd });

    expect(result).toEqual({ ended: 0, warnings: [] });
    expect(sessionGateway.removeCalls).toEqual([]);
  });
});
