import { beforeEach, describe, expect, it } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import {
  parseReviewOrchestrationSettings,
  type ReviewOrchestrationSettings,
} from '@/modules/claude-invocation/entities/roleSession/reviewOrchestration.js';
import type { ReviewRole } from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';
import type { BackgroundSession } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import { AwaitRoleSessionsUseCase } from '@/modules/claude-invocation/usecases/awaitRoleSessions.usecase.js';
import { RoleSessionJobFactory } from '@/tests/factories/roleSessionJob.factory.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubRoleSessionGateway } from '@/tests/stubs/roleSession.stub.js';
import { InMemoryRoleSessionJobGateway } from '@/tests/stubs/roleSessionJob.stub.js';

const MINUTE_MS = 60_000;
const POLL_INTERVAL_MS = 10_000;
const jobId = 'github:acme/app:2111';
const launchedAt = new Date('2026-11-27T09:00:00.000Z');

function backgroundSession(sessionId: string, state: string): BackgroundSession {
  return {
    sessionId: parseSessionId(sessionId),
    name: null,
    cwd: null,
    startedAt: launchedAt,
    state,
  };
}

describe('AwaitRoleSessionsUseCase', () => {
  let roleSessionGateway: StubRoleSessionGateway;
  let roleSessionJobGateway: InMemoryRoleSessionJobGateway;
  let sessionGateway: StubClaudeSessionGateway;
  let reviewSettings: ReviewOrchestrationSettings | null;
  let clock: Date;
  let waits: number[];
  let onWait: () => void;
  let useCase: AwaitRoleSessionsUseCase;

  function recordLots(lots: Array<{ sessionId: string; role: ReviewRole }>): void {
    roleSessionJobGateway.save(
      RoleSessionJobFactory.create({
        jobId,
        roleSessions: lots.map(({ sessionId, role }) => ({
          sessionId: parseSessionId(sessionId),
          role,
          launchedAt: launchedAt.toISOString(),
        })),
      }),
    );
  }

  function minutesAfterLaunch(minutes: number): Date {
    return new Date(launchedAt.getTime() + minutes * MINUTE_MS);
  }

  beforeEach(() => {
    roleSessionGateway = new StubRoleSessionGateway();
    roleSessionJobGateway = new InMemoryRoleSessionJobGateway();
    sessionGateway = new StubClaudeSessionGateway();
    reviewSettings = null;
    clock = minutesAfterLaunch(2);
    waits = [];
    onWait = () => {};
    useCase = new AwaitRoleSessionsUseCase({
      roleSessionGateway,
      roleSessionJobGateway,
      sessionGateway,
      reviewSettingsOf: () => reviewSettings,
      now: () => clock,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        clock = new Date(clock.getTime() + milliseconds);
        onWait();
      },
      pollIntervalMs: POLL_INTERVAL_MS,
    });
  });

  it('reports at once the lots that are done, failed or stopped', async () => {
    recordLots([
      { sessionId: 'aaaa0001', role: 'lot:bugs' },
      { sessionId: 'aaaa0002', role: 'lot:architecture' },
      { sessionId: 'aaaa0003', role: 'lot:tests' },
    ]);
    roleSessionGateway.listBackground([
      backgroundSession('aaaa0001', 'done'),
      backgroundSession('aaaa0002', 'failed'),
      backgroundSession('aaaa0003', 'stopped'),
    ]);

    const result = await useCase.execute({ jobId, maxWaitMs: null });

    expect(result).toEqual({
      status: 'awaited',
      outcomes: [
        { verdict: 'done', role: 'lot:bugs', sessionId: 'aaaa0001' },
        { verdict: 'failed', role: 'lot:architecture', sessionId: 'aaaa0002' },
        { verdict: 'failed', role: 'lot:tests', sessionId: 'aaaa0003' },
      ],
    });
    expect(waits).toEqual([]);
  });

  it('waits until a working lot is done', async () => {
    recordLots([{ sessionId: 'aaaa0001', role: 'lot:bugs' }]);
    roleSessionGateway.listBackground([backgroundSession('aaaa0001', 'working')]);
    onWait = () => roleSessionGateway.listBackground([backgroundSession('aaaa0001', 'done')]);

    const result = await useCase.execute({ jobId, maxWaitMs: null });

    expect(result).toEqual({
      status: 'awaited',
      outcomes: [{ verdict: 'done', role: 'lot:bugs', sessionId: 'aaaa0001' }],
    });
    expect(waits).toEqual([POLL_INTERVAL_MS]);
  });

  it('stops a lot still working 15 minutes after its launch and reports it timed out', async () => {
    recordLots([{ sessionId: 'aaaa0001', role: 'lot:lisibilite' }]);
    roleSessionGateway.listBackground([backgroundSession('aaaa0001', 'working')]);
    clock = minutesAfterLaunch(16);

    const result = await useCase.execute({ jobId, maxWaitMs: null });

    expect(result).toEqual({
      status: 'awaited',
      outcomes: [{ verdict: 'timeout', role: 'lot:lisibilite', sessionId: 'aaaa0001' }],
    });
    expect(sessionGateway.stopCalls).toEqual(['aaaa0001']);
    expect(sessionGateway.removeCalls).toEqual([]);
  });

  it('still reports as timed out a lot it already stopped, without stopping it again', async () => {
    recordLots([{ sessionId: 'aaaa0001', role: 'lot:lisibilite' }]);
    roleSessionGateway.listBackground([backgroundSession('aaaa0001', 'stopped')]);
    clock = minutesAfterLaunch(20);

    const result = await useCase.execute({ jobId, maxWaitMs: null });

    expect(result).toEqual({
      status: 'awaited',
      outcomes: [{ verdict: 'timeout', role: 'lot:lisibilite', sessionId: 'aaaa0001' }],
    });
    expect(sessionGateway.stopCalls).toEqual([]);
  });

  it('gives a lot the time the project configures', async () => {
    reviewSettings = parseReviewOrchestrationSettings({ roleTimeoutMinutes: 20 });
    recordLots([{ sessionId: 'aaaa0001', role: 'lot:bugs' }]);
    roleSessionGateway.listBackground([backgroundSession('aaaa0001', 'working')]);
    clock = minutesAfterLaunch(16);

    const result = await useCase.execute({ jobId, maxWaitMs: 0 });

    expect(result).toEqual({ status: 'awaited', outcomes: [] });
    expect(sessionGateway.stopCalls).toEqual([]);
  });

  it('returns after the maximum wait with the lots finished so far, silent on the working ones', async () => {
    recordLots([
      { sessionId: 'aaaa0001', role: 'lot:bugs' },
      { sessionId: 'aaaa0002', role: 'lot:tests' },
    ]);
    roleSessionGateway.listBackground([
      backgroundSession('aaaa0001', 'done'),
      backgroundSession('aaaa0002', 'working'),
    ]);

    const result = await useCase.execute({ jobId, maxWaitMs: 25_000 });

    expect(result).toEqual({
      status: 'awaited',
      outcomes: [{ verdict: 'done', role: 'lot:bugs', sessionId: 'aaaa0001' }],
    });
    expect(waits).toEqual([POLL_INTERVAL_MS, POLL_INTERVAL_MS, 5_000]);
  });

  it('reports as failed a lot that Claude no longer lists', async () => {
    recordLots([{ sessionId: 'aaaa0001', role: 'lot:bugs' }]);
    roleSessionGateway.listBackground([]);

    const result = await useCase.execute({ jobId, maxWaitMs: null });

    expect(result).toEqual({
      status: 'awaited',
      outcomes: [{ verdict: 'failed', role: 'lot:bugs', sessionId: 'aaaa0001' }],
    });
  });

  it('returns at once when the job launched no role session', async () => {
    recordLots([]);

    const result = await useCase.execute({ jobId, maxWaitMs: null });

    expect(result).toEqual({ status: 'awaited', outcomes: [] });
  });

  it('refuses an unknown job', async () => {
    const result = await useCase.execute({ jobId: 'github:acme/app:404', maxWaitMs: null });

    expect(result).toEqual({ status: 'refused', reason: 'unknown job github:acme/app:404' });
  });

  it('refuses when Claude sessions cannot be listed', async () => {
    recordLots([{ sessionId: 'aaaa0001', role: 'lot:bugs' }]);
    roleSessionGateway.failListing('daemon down');

    const result = await useCase.execute({ jobId, maxWaitMs: null });

    expect(result).toEqual({
      status: 'refused',
      reason: 'cannot list Claude sessions: daemon down',
    });
  });
});
