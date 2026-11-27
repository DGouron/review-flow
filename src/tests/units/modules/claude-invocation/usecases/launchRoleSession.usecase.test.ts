import { beforeEach, describe, expect, it } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { ReviewOrchestrationSettings } from '@/modules/claude-invocation/entities/roleSession/reviewOrchestration.js';
import { LaunchRoleSessionUseCase } from '@/modules/claude-invocation/usecases/launchRoleSession.usecase.js';
import { RoleSessionJobFactory } from '@/tests/factories/roleSessionJob.factory.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubRoleSessionGateway } from '@/tests/stubs/roleSession.stub.js';
import { InMemoryRoleSessionJobGateway } from '@/tests/stubs/roleSessionJob.stub.js';

const now = new Date('2026-11-27T09:00:00.000Z');
const jobId = 'github:acme/app:2111';

describe('LaunchRoleSessionUseCase', () => {
  let roleSessionGateway: StubRoleSessionGateway;
  let roleSessionJobGateway: InMemoryRoleSessionJobGateway;
  let sessionGateway: StubClaudeSessionGateway;
  let reviewSettings: ReviewOrchestrationSettings | null;
  let useCase: LaunchRoleSessionUseCase;

  beforeEach(() => {
    roleSessionGateway = new StubRoleSessionGateway();
    roleSessionJobGateway = new InMemoryRoleSessionJobGateway();
    sessionGateway = new StubClaudeSessionGateway();
    reviewSettings = null;
    useCase = new LaunchRoleSessionUseCase({
      roleSessionGateway,
      roleSessionJobGateway,
      sessionGateway,
      reviewSettingsOf: () => reviewSettings,
      now: () => now,
    });
    roleSessionJobGateway.save(
      RoleSessionJobFactory.create({ jobId, worktreePath: '/wt/github-acme-app-2111' }),
    );
  });

  it('launches the role in the job worktree with its default model and records it', async () => {
    roleSessionGateway.willLaunch('a1b2c3d4');

    const result = await useCase.execute({ role: 'greffe', brief: 'Dirige la revue.', jobId });

    expect(result).toEqual({
      status: 'launched',
      sessionId: 'a1b2c3d4',
      name: 'Revue #2111 · greffe',
    });
    expect(roleSessionGateway.launches).toEqual([
      {
        name: 'Revue #2111 · greffe',
        model: 'sonnet',
        brief: 'Dirige la revue.',
        cwd: '/wt/github-acme-app-2111',
      },
    ]);
    expect(roleSessionJobGateway.recordedSessionsOf(jobId)).toEqual([
      { sessionId: parseSessionId('a1b2c3d4'), role: 'greffe', launchedAt: now.toISOString() },
    ]);
  });

  it('uses the model the project configures for the role', async () => {
    reviewSettings = { mode: 'orchestrated', roles: { 'lot:lisibilite': { model: 'opus' } } };

    await useCase.execute({ role: 'lot:lisibilite', brief: 'Lis.', jobId });

    expect(roleSessionGateway.launches[0]?.model).toBe('opus');
  });

  it('refuses an unknown role and lists the known ones', async () => {
    const result = await useCase.execute({ role: 'lot:perf', brief: 'Brief.', jobId });

    expect(result).toEqual({
      status: 'refused',
      reason:
        'unknown role "lot:perf" (expected greffe, lot:bugs, lot:securite, lot:architecture, lot:lisibilite, contradiction, arbitre)',
    });
    expect(roleSessionGateway.launches).toEqual([]);
  });

  it.each([null, '', '  \n'])('refuses a missing or empty brief (%j)', async (brief) => {
    const result = await useCase.execute({ role: 'greffe', brief, jobId });

    expect(result).toEqual({ status: 'refused', reason: 'brief is missing or empty' });
    expect(roleSessionGateway.launches).toEqual([]);
  });

  it('refuses an unknown job', async () => {
    const result = await useCase.execute({ role: 'greffe', brief: 'Brief.', jobId: 'gone' });

    expect(result).toEqual({ status: 'refused', reason: 'unknown job gone' });
  });

  it('refuses a job whose file cannot be used, with its reason', async () => {
    roleSessionJobGateway.markUnusable(jobId, `job ${jobId} has no worktree yet`);

    const result = await useCase.execute({ role: 'greffe', brief: 'Brief.', jobId });

    expect(result).toEqual({ status: 'refused', reason: `job ${jobId} has no worktree yet` });
    expect(roleSessionGateway.launches).toEqual([]);
  });

  it('refuses with the CLI reason when the dispatch fails and records nothing', async () => {
    roleSessionGateway.willFailToLaunch({ status: 'failed', rawStderr: 'model not found' });

    const result = await useCase.execute({ role: 'greffe', brief: 'Brief.', jobId });

    expect(result).toEqual({ status: 'refused', reason: 'dispatch failed: model not found' });
    expect(roleSessionJobGateway.recordedSessionsOf(jobId)).toEqual([]);
  });

  it('refuses a rate-limited dispatch', async () => {
    roleSessionGateway.willFailToLaunch({ status: 'rate-limited', rawStderr: '429 Too Many' });

    const result = await useCase.execute({ role: 'greffe', brief: 'Brief.', jobId });

    expect(result).toEqual({ status: 'refused', reason: 'dispatch rate-limited: 429 Too Many' });
  });

  it('stops and removes a dispatched session it cannot record, then refuses', async () => {
    roleSessionGateway.willLaunch('untrack1');
    roleSessionJobGateway.failRecording('disk full');

    const result = await useCase.execute({ role: 'greffe', brief: 'Brief.', jobId });

    expect(result).toEqual({
      status: 'refused',
      reason: 'session untrack1 could not be recorded (disk full); it was stopped and removed',
    });
    expect(sessionGateway.stopCalls).toEqual(['untrack1']);
    expect(sessionGateway.removeCalls).toEqual(['untrack1']);
  });

  it('refuses instead of throwing when another launch keeps the job locked', async () => {
    roleSessionJobGateway.failExclusiveAccess('another launch holds the job lock');

    const result = await useCase.execute({ role: 'greffe', brief: 'Brief.', jobId });

    expect(result).toEqual({ status: 'refused', reason: 'another launch holds the job lock' });
  });

  it('refuses to launch a role for a job that is ending its role sessions', async () => {
    roleSessionJobGateway.save(RoleSessionJobFactory.create({ jobId, roleSessionsClosed: true }));

    const result = await useCase.execute({ role: 'arbitre', brief: 'Tranche.', jobId });

    expect(result).toEqual({
      status: 'refused',
      reason: `job ${jobId} is ending: no new role session`,
    });
    expect(roleSessionGateway.launches).toEqual([]);
  });

  describe('cap of live role sessions per job', () => {
    function recordSessions(sessionIds: string[]): void {
      roleSessionJobGateway.save(
        RoleSessionJobFactory.create({
          jobId,
          roleSessions: sessionIds.map((sessionId) => ({
            sessionId: parseSessionId(sessionId),
            role: 'lot:bugs',
            launchedAt: '2026-11-27T08:50:00.000Z',
          })),
        }),
      );
    }

    it('refuses a sixth live role session', async () => {
      const liveIds = ['live0001', 'live0002', 'live0003', 'live0004', 'live0005'];
      recordSessions(liveIds);
      roleSessionGateway.listSessions(liveIds);

      const result = await useCase.execute({ role: 'arbitre', brief: 'Tranche.', jobId });

      expect(result).toEqual({
        status: 'refused',
        reason: `job ${jobId} already has 5 live role sessions (cap 5)`,
      });
      expect(roleSessionGateway.launches).toEqual([]);
    });

    it('no longer counts a recorded session Claude does not list anymore', async () => {
      recordSessions(['ended001', 'live0002', 'live0003', 'live0004', 'live0005']);
      roleSessionGateway.listSessions(['live0002', 'live0003', 'live0004', 'live0005']);

      const result = await useCase.execute({ role: 'arbitre', brief: 'Tranche.', jobId });

      expect(result.status).toBe('launched');
    });

    it('does not count a finished or stopped session Claude still lists', async () => {
      const ids = ['done0001', 'stop0002', 'fail0003', 'live0004', 'live0005'];
      recordSessions(ids);
      roleSessionGateway.listBackground(
        ids.map((sessionId, index) => ({
          sessionId: parseSessionId(sessionId),
          name: null,
          cwd: null,
          startedAt: null,
          state: ['done', 'stopped', 'failed', 'working', 'idle'][index] ?? null,
        })),
      );

      const result = await useCase.execute({ role: 'contradiction', brief: 'Conteste.', jobId });

      expect(result.status).toBe('launched');
    });

    it('counts a waiting session as live', async () => {
      const ids = ['wait0001', 'live0002', 'live0003', 'live0004', 'live0005'];
      recordSessions(ids);
      roleSessionGateway.listBackground(
        ids.map((sessionId, index) => ({
          sessionId: parseSessionId(sessionId),
          name: null,
          cwd: null,
          startedAt: null,
          state: index === 0 ? 'blocked' : 'working',
        })),
      );

      const result = await useCase.execute({ role: 'arbitre', brief: 'Tranche.', jobId });

      expect(result.status).toBe('refused');
    });

    it('refuses to launch when the live sessions cannot be counted', async () => {
      roleSessionGateway.failListing('claude agents exited 1');

      const result = await useCase.execute({ role: 'greffe', brief: 'Brief.', jobId });

      expect(result).toEqual({
        status: 'refused',
        reason: 'cannot count live role sessions: claude agents exited 1',
      });
      expect(roleSessionGateway.launches).toEqual([]);
    });
  });
});
