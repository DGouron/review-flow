/**
 * SPEC-235 lot B — End and sweep role sessions
 *
 * Outer-loop acceptance test (SDD): `reviewflow session end` stops then removes one role session,
 * idempotently; `reviewflow session sweep` removes the role sessions whose job is no longer
 * active or that run for more than two hours. Only the Claude CLI is stubbed.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  executeSessionEnd,
  executeSessionSweep,
  type SessionCleanupDependencies,
} from '@/main/commands/session.command.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { BackgroundSession } from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';
import { RoleSessionJobFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSessionJob.fileSystem.gateway.js';
import { EndRoleSessionUseCase } from '@/modules/claude-invocation/usecases/endRoleSession.usecase.js';
import { SweepRoleSessionsUseCase } from '@/modules/claude-invocation/usecases/sweepRoleSessions.usecase.js';
import { RoleSessionJobFileFactory } from '@/tests/factories/roleSessionJobFile.factory.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubRoleSessionGateway } from '@/tests/stubs/roleSession.stub.js';

const now = new Date('2026-11-27T12:00:00.000Z');
const worktreeRoot = '/home/ai/.reviewflow/worktrees';
const worktree = `${worktreeRoot}/github-acme-app-2111`;

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

function roleSession(id: string, name: string, startedAt: Date): BackgroundSession {
  return { sessionId: parseSessionId(id), name, cwd: worktree, startedAt, state: 'working' };
}

describe('SPEC-235 lot B — end and sweep role sessions', () => {
  let root: string;
  let jobsDirectory: string;
  let roleSessions: StubRoleSessionGateway;
  let claudeSessions: StubClaudeSessionGateway;
  let printed: string[];
  let exitCodes: number[];
  let dependencies: SessionCleanupDependencies;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spec-235-b-'));
    jobsDirectory = join(root, 'jobs');
    mkdirSync(jobsDirectory);
    roleSessions = new StubRoleSessionGateway();
    claudeSessions = new StubClaudeSessionGateway();
    printed = [];
    exitCodes = [];
    const cleanupDependencies = {
      roleSessionGateway: roleSessions,
      roleSessionJobGateway: new RoleSessionJobFileSystemGateway(jobsDirectory),
      sessionGateway: claudeSessions,
      worktreeRoot,
      now: () => now,
      reviewTimeoutMs: () => 15 * 60_000,
    };
    dependencies = {
      endRoleSession: new EndRoleSessionUseCase(cleanupDependencies),
      sweepRoleSessions: new SweepRoleSessionsUseCase(cleanupDependencies),
      print: (line) => printed.push(line),
      exit: (code) => exitCodes.push(code),
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function recordActiveJob(sessionIds: string[]): void {
    writeFileSync(
      join(jobsDirectory, 'github-acme-app-2111.json'),
      JSON.stringify(
        RoleSessionJobFileFactory.create({
          worktreePath: worktree,
          roleSessions: sessionIds.map((sessionId) => ({
            sessionId,
            role: 'lot:bugs',
            launchedAt: minutesAgo(10).toISOString(),
          })),
        }),
      ),
    );
  }

  it('ends a role session: stop then remove, and prints its name', async () => {
    roleSessions.listBackground([roleSession('a1b2c3d4', 'Revue #2111 · lot bugs', minutesAgo(5))]);

    await executeSessionEnd({ sessionId: 'a1b2c3d4' }, dependencies);

    expect(printed).toEqual(['REMOVED Revue #2111 · lot bugs']);
    expect(exitCodes).toEqual([0]);
    expect(claudeSessions.stopCalls).toEqual(['a1b2c3d4']);
    expect(claudeSessions.removeCalls).toEqual(['a1b2c3d4']);
  });

  it('ending a session that is already gone succeeds without touching Claude', async () => {
    roleSessions.listBackground([]);

    await executeSessionEnd({ sessionId: 'a1b2c3d4' }, dependencies);

    expect(printed).toEqual(['ALREADY-GONE a1b2c3d4']);
    expect(exitCodes).toEqual([0]);
    expect(claudeSessions.removeCalls).toEqual([]);
  });

  it('sweeps orphans and old sessions, keeps the active ones and leaves other sessions alone', async () => {
    recordActiveJob(['active01', 'oldrole1']);
    roleSessions.listBackground([
      roleSession('active01', 'Revue #2111 · lot bugs', minutesAgo(10)),
      roleSession('oldrole1', 'Revue #2111 · arbitre', minutesAgo(180)),
      roleSession('orphan01', 'Revue #2042 · lot sécurité', minutesAgo(30)),
      {
        sessionId: parseSessionId('review01'),
        name: null,
        cwd: worktree,
        startedAt: minutesAgo(5),
        state: 'working',
      },
      {
        sessionId: parseSessionId('human001'),
        name: 'Revue #9 · arbitre',
        cwd: '/home/ai/projects/app',
        startedAt: minutesAgo(300),
        state: 'working',
      },
    ]);

    await executeSessionSweep({ dryRun: false }, dependencies);

    expect(printed).toEqual([
      'KEPT active01 Revue #2111 · lot bugs (job github:acme/app:2111 active)',
      'REMOVED oldrole1 Revue #2111 · arbitre (started more than 2 hours ago)',
      'REMOVED orphan01 Revue #2042 · lot sécurité (job no longer active)',
    ]);
    expect(exitCodes).toEqual([0]);
    expect(claudeSessions.removeCalls).toEqual(['oldrole1', 'orphan01']);
  });

  it('dry-run says what it would remove and removes nothing', async () => {
    roleSessions.listBackground([
      roleSession('orphan01', 'Suivi #2042 · contradiction', minutesAgo(30)),
    ]);

    await executeSessionSweep({ dryRun: true }, dependencies);

    expect(printed).toEqual([
      'WOULD-REMOVE orphan01 Suivi #2042 · contradiction (job no longer active)',
    ]);
    expect(claudeSessions.stopCalls).toEqual([]);
    expect(claudeSessions.removeCalls).toEqual([]);
  });
});
