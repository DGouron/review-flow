/**
 * SPEC-235 lot A — Launch a role session of an orchestrated review
 *
 * Outer-loop acceptance test (SDD): `reviewflow session launch` reads the job file the server
 * wrote, launches a read-only `claude --bg` session named after the review and the role, records
 * it in the job file and refuses what it must refuse. Only the Claude CLI is stubbed.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadReviewOrchestrationSettings } from '@/config/projectConfig.js';
import {
  executeSessionLaunch,
  type SessionLaunchDependencies,
} from '@/main/commands/session.command.js';
import { RoleSessionJobFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSessionJob.fileSystem.gateway.js';
import { LaunchRoleSessionUseCase } from '@/modules/claude-invocation/usecases/launchRoleSession.usecase.js';
import { RoleSessionJobFileFactory } from '@/tests/factories/roleSessionJobFile.factory.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubRoleSessionGateway } from '@/tests/stubs/roleSession.stub.js';

interface Harness {
  root: string;
  jobsDirectory: string;
  briefPath: string;
  roleSessions: StubRoleSessionGateway;
  printed: string[];
  exitCodes: number[];
  dependencies: SessionLaunchDependencies;
}

function buildHarness(): Harness {
  const root = mkdtempSync(join(tmpdir(), 'spec-235-'));
  const jobsDirectory = join(root, 'jobs');
  mkdirSync(jobsDirectory, { recursive: true });
  const briefPath = join(root, 'brief.md');
  writeFileSync(briefPath, 'Audite les bugs de la PR #2111.');
  const roleSessions = new StubRoleSessionGateway();
  const printed: string[] = [];
  const exitCodes: number[] = [];
  const launchRoleSession = new LaunchRoleSessionUseCase({
    roleSessionGateway: roleSessions,
    roleSessionJobGateway: new RoleSessionJobFileSystemGateway(jobsDirectory),
    sessionGateway: new StubClaudeSessionGateway(),
    reviewSettingsOf: loadReviewOrchestrationSettings,
    now: () => new Date('2026-11-27T09:00:00.000Z'),
  });
  return {
    root,
    jobsDirectory,
    briefPath,
    roleSessions,
    printed,
    exitCodes,
    dependencies: {
      launchRoleSession,
      readBrief: (path) => {
        try {
          return readFileSync(path, 'utf-8');
        } catch {
          return null;
        }
      },
      print: (line) => printed.push(line),
      exit: (code) => exitCodes.push(code),
    },
  };
}

function writeJobFile(harness: Harness, content: Record<string, unknown>): string {
  const path = join(harness.jobsDirectory, 'github-acme-app-2111.json');
  writeFileSync(path, JSON.stringify(content, null, 2));
  return path;
}

function readJobFile(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('job file is not an object');
  }
  return Object.fromEntries(Object.entries(parsed));
}

describe('SPEC-235 lot A — launch a role session', () => {
  let harness: Harness;
  let localPath: string;
  let worktreePath: string;

  beforeEach(() => {
    harness = buildHarness();
    localPath = join(harness.root, 'acme-app');
    worktreePath = join(harness.root, 'worktrees', 'github-acme-app-2111');
    mkdirSync(join(localPath, '.claude', 'reviews'), { recursive: true });
  });

  afterEach(() => {
    rmSync(harness.root, { recursive: true, force: true });
  });

  it('launches a read-only bugs lot on opus in the job worktree and records it', async () => {
    const jobFilePath = writeJobFile(
      harness,
      RoleSessionJobFileFactory.create({ jobId: 'github:acme/app:2111', localPath, worktreePath }),
    );
    harness.roleSessions.willLaunch('a1b2c3d4');

    await executeSessionLaunch(
      { role: 'lot:bugs', brief: harness.briefPath, job: 'github:acme/app:2111' },
      harness.dependencies,
    );

    expect(harness.printed).toEqual(['LAUNCHED a1b2c3d4 Revue #2111 · lot bugs']);
    expect(harness.exitCodes).toEqual([0]);
    expect(harness.roleSessions.launches).toEqual([
      expect.objectContaining({
        name: 'Revue #2111 · lot bugs',
        model: 'opus',
        cwd: worktreePath,
        brief: 'Audite les bugs de la PR #2111.',
      }),
    ]);
    expect(readJobFile(jobFilePath).roleSessions).toEqual([
      { sessionId: 'a1b2c3d4', role: 'lot:bugs', launchedAt: '2026-11-27T09:00:00.000Z' },
    ]);
  });

  it('uses the model the project configures for the role', async () => {
    writeFileSync(
      join(localPath, '.claude', 'reviews', 'config.json'),
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        review: { mode: 'orchestrated', roles: { 'lot:lisibilite': { model: 'opus' } } },
      }),
    );
    writeJobFile(
      harness,
      RoleSessionJobFileFactory.create({ jobId: 'github:acme/app:2111', localPath, worktreePath }),
    );

    await executeSessionLaunch(
      { role: 'lot:lisibilite', brief: harness.briefPath, job: 'github:acme/app:2111' },
      harness.dependencies,
    );

    expect(harness.roleSessions.launches[0]?.model).toBe('opus');
  });

  it('keeps the first entry when the same role is relaunched', async () => {
    const jobFilePath = writeJobFile(
      harness,
      RoleSessionJobFileFactory.create({ jobId: 'github:acme/app:2111', localPath, worktreePath }),
    );

    harness.roleSessions.willLaunch('first001');
    await executeSessionLaunch(
      { role: 'lot:bugs', brief: harness.briefPath, job: 'github:acme/app:2111' },
      harness.dependencies,
    );
    harness.roleSessions.willLaunch('second02');
    await executeSessionLaunch(
      { role: 'lot:bugs', brief: harness.briefPath, job: 'github:acme/app:2111' },
      harness.dependencies,
    );

    expect(readJobFile(jobFilePath).roleSessions).toEqual([
      expect.objectContaining({ sessionId: 'first001', role: 'lot:bugs' }),
      expect.objectContaining({ sessionId: 'second02', role: 'lot:bugs' }),
    ]);
  });

  it('refuses a sixth live role session for one job', async () => {
    const liveIds = ['live0001', 'live0002', 'live0003', 'live0004', 'live0005'];
    writeJobFile(
      harness,
      RoleSessionJobFileFactory.create({
        jobId: 'github:acme/app:2111',
        localPath,
        worktreePath,
        roleSessions: liveIds.map((sessionId) => ({
          sessionId,
          role: 'lot:bugs',
          launchedAt: '2026-11-27T08:50:00.000Z',
        })),
      }),
    );
    harness.roleSessions.listSessions(liveIds);

    await executeSessionLaunch(
      { role: 'arbitre', brief: harness.briefPath, job: 'github:acme/app:2111' },
      harness.dependencies,
    );

    expect(harness.printed).toHaveLength(1);
    expect(harness.printed[0]).toMatch(/^ERROR .*5 live role sessions/);
    expect(harness.exitCodes).toEqual([1]);
    expect(harness.roleSessions.launches).toEqual([]);
  });

  it('refuses an unknown job', async () => {
    await executeSessionLaunch(
      { role: 'greffe', brief: harness.briefPath, job: 'github:acme/app:404' },
      harness.dependencies,
    );

    expect(harness.printed).toEqual(['ERROR unknown job github:acme/app:404']);
    expect(harness.exitCodes).toEqual([1]);
  });

  it('refuses an unknown role and a missing brief', async () => {
    writeJobFile(
      harness,
      RoleSessionJobFileFactory.create({ jobId: 'github:acme/app:2111', localPath, worktreePath }),
    );

    await executeSessionLaunch(
      { role: 'lot:perf', brief: harness.briefPath, job: 'github:acme/app:2111' },
      harness.dependencies,
    );
    await executeSessionLaunch(
      { role: 'greffe', brief: join(harness.root, 'missing.md'), job: 'github:acme/app:2111' },
      harness.dependencies,
    );

    expect(harness.printed[0]).toMatch(/^ERROR unknown role "lot:perf"/);
    expect(harness.printed[1]).toMatch(/^ERROR brief .*missing\.md/);
    expect(harness.exitCodes).toEqual([1, 1]);
    expect(harness.roleSessions.launches).toEqual([]);
  });
});
