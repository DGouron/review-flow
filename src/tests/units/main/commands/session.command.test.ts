import { beforeEach, describe, expect, it } from 'vitest';

import {
  executeSessionEnd,
  executeSessionLaunch,
  executeSessionSweep,
  type SessionCleanupDependencies,
  type SessionLaunchDependencies,
} from '@/main/commands/session.command.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import { EndRoleSessionUseCase } from '@/modules/claude-invocation/usecases/endRoleSession.usecase.js';
import { LaunchRoleSessionUseCase } from '@/modules/claude-invocation/usecases/launchRoleSession.usecase.js';
import { SweepRoleSessionsUseCase } from '@/modules/claude-invocation/usecases/sweepRoleSessions.usecase.js';
import { RoleSessionJobFactory } from '@/tests/factories/roleSessionJob.factory.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubRoleSessionGateway } from '@/tests/stubs/roleSession.stub.js';
import { InMemoryRoleSessionJobGateway } from '@/tests/stubs/roleSessionJob.stub.js';

const jobId = 'github:acme/app:2111';

describe('executeSessionLaunch', () => {
  let printed: string[];
  let exitCodes: number[];
  let briefs: Map<string, string>;
  let roleSessionGateway: StubRoleSessionGateway;
  let dependencies: SessionLaunchDependencies;

  beforeEach(() => {
    printed = [];
    exitCodes = [];
    briefs = new Map([['/tmp/brief.md', 'Audite.']]);
    roleSessionGateway = new StubRoleSessionGateway();
    const roleSessionJobGateway = new InMemoryRoleSessionJobGateway();
    roleSessionJobGateway.save(RoleSessionJobFactory.create({ jobId }));
    dependencies = {
      launchRoleSession: new LaunchRoleSessionUseCase({
        roleSessionGateway,
        roleSessionJobGateway,
        sessionGateway: new StubClaudeSessionGateway(),
        reviewSettingsOf: () => null,
        now: () => new Date('2026-11-27T09:00:00.000Z'),
      }),
      readBrief: (path) => briefs.get(path) ?? null,
      print: (line) => printed.push(line),
      exit: (code) => exitCodes.push(code),
    };
  });

  it('prints the launched session id and name and exits 0', async () => {
    roleSessionGateway.willLaunch('a1b2c3d4');

    await executeSessionLaunch(
      { role: 'lot:securite', brief: '/tmp/brief.md', job: jobId },
      dependencies,
    );

    expect(printed).toEqual(['LAUNCHED a1b2c3d4 Revue #2111 · lot sécurité']);
    expect(exitCodes).toEqual([0]);
  });

  it.each([
    [{ role: null, brief: '/tmp/brief.md', job: jobId }, '--role'],
    [{ role: 'greffe', brief: null, job: jobId }, '--brief'],
    [{ role: 'greffe', brief: '/tmp/brief.md', job: null }, '--job'],
  ])('refuses a launch without %s', async (args, missingOption) => {
    await executeSessionLaunch(args, dependencies);

    expect(printed).toEqual([
      `ERROR missing ${missingOption} (usage: reviewflow session launch --role <role> --brief <file> --job <jobId>)`,
    ]);
    expect(exitCodes).toEqual([1]);
  });

  it('refuses a brief file that cannot be read', async () => {
    await executeSessionLaunch(
      { role: 'greffe', brief: '/tmp/absent.md', job: jobId },
      dependencies,
    );

    expect(printed).toEqual(['ERROR brief /tmp/absent.md cannot be read']);
    expect(exitCodes).toEqual([1]);
    expect(roleSessionGateway.launches).toEqual([]);
  });

  it('prints the refusal of the launch on one line and exits 1', async () => {
    roleSessionGateway.willFailToLaunch({ status: 'failed', rawStderr: 'line one\nline two' });

    await executeSessionLaunch(
      { role: 'greffe', brief: '/tmp/brief.md', job: jobId },
      dependencies,
    );

    expect(printed).toEqual(['ERROR dispatch failed: line one line two']);
    expect(exitCodes).toEqual([1]);
  });
});

describe('executeSessionEnd and executeSessionSweep', () => {
  const worktreeRoot = '/home/ai/.reviewflow/worktrees';
  let printed: string[];
  let exitCodes: number[];
  let roleSessionGateway: StubRoleSessionGateway;
  let sessionGateway: StubClaudeSessionGateway;
  let dependencies: SessionCleanupDependencies;

  beforeEach(() => {
    printed = [];
    exitCodes = [];
    roleSessionGateway = new StubRoleSessionGateway();
    sessionGateway = new StubClaudeSessionGateway();
    const cleanupDependencies = {
      roleSessionGateway,
      roleSessionJobGateway: new InMemoryRoleSessionJobGateway(),
      sessionGateway,
      worktreeRoot,
      now: () => new Date('2026-11-27T12:00:00.000Z'),
    };
    dependencies = {
      endRoleSession: new EndRoleSessionUseCase(cleanupDependencies),
      sweepRoleSessions: new SweepRoleSessionsUseCase(cleanupDependencies),
      print: (line) => printed.push(line),
      exit: (code) => exitCodes.push(code),
    };
  });

  function listOrphan(name: string | null): void {
    roleSessionGateway.listBackground([
      {
        sessionId: parseSessionId('orphan01'),
        name,
        cwd: `${worktreeRoot}/github-acme-app-2042`,
        startedAt: null,
        state: 'working',
      },
    ]);
  }

  it('refuses session end without a session id', async () => {
    await executeSessionEnd({ sessionId: null }, dependencies);

    expect(printed).toEqual(['ERROR missing session id (usage: reviewflow session end <id>)']);
    expect(exitCodes).toEqual([1]);
  });

  it('prints the failure of session end and exits 1', async () => {
    listOrphan('Revue #2042 · greffe');
    sessionGateway.setRemoveResult({ success: false, warning: 'busy' });

    await executeSessionEnd({ sessionId: 'orphan01' }, dependencies);

    expect(printed).toEqual(['ERROR Revue #2042 · greffe not removed: remove: busy']);
    expect(exitCodes).toEqual([1]);
  });

  it('prints nothing and exits 0 when there is no role session to sweep', async () => {
    roleSessionGateway.listBackground([]);

    await executeSessionSweep({ dryRun: false }, dependencies);

    expect(printed).toEqual([]);
    expect(exitCodes).toEqual([0]);
  });

  it('exits 1 when a sweep could not remove a session', async () => {
    listOrphan('Revue #2042 · greffe');
    sessionGateway.setRemoveResult({ success: false, warning: 'busy' });

    await executeSessionSweep({ dryRun: false }, dependencies);

    expect(printed).toEqual([
      'FAILED orphan01 Revue #2042 · greffe (job no longer active; remove: busy)',
    ]);
    expect(exitCodes).toEqual([1]);
  });

  it('exits 1 when the sweep cannot list Claude sessions', async () => {
    roleSessionGateway.failListing('daemon down');

    await executeSessionSweep({ dryRun: true }, dependencies);

    expect(printed).toEqual(['ERROR cannot list Claude sessions: daemon down']);
    expect(exitCodes).toEqual([1]);
  });
});
