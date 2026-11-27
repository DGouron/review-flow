/**
 * SPEC-236 — Orchestrated review mode
 *
 * Outer-loop acceptance test (SDD): an orchestrated review runs as the named clerk on the
 * `orchestre` argument; its lots may message it; `reviewflow session await` reports each lot as
 * DONE, FAILED or TIMEOUT. Only the `claude` binary is faked.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadReviewOrchestrationSettings } from '@/config/projectConfig.js';
import {
  executeSessionAwait,
  type SessionAwaitDependencies,
} from '@/main/commands/sessionAwait.command.js';
import { reviewSessionPlanOf } from '@/modules/claude-invocation/entities/roleSession/reviewSessionPlan.js';
import {
  ClaudeSessionCliGateway,
  type ClaudeProcessRunner,
} from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';
import { RoleSessionClaudeCliGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSession.claude.cli.gateway.js';
import { RoleSessionJobFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSessionJob.fileSystem.gateway.js';
import { AwaitRoleSessionsUseCase } from '@/modules/claude-invocation/usecases/awaitRoleSessions.usecase.js';
import { SweepRoleSessionsUseCase } from '@/modules/claude-invocation/usecases/sweepRoleSessions.usecase.js';
import { ProjectConfigFactory } from '@/tests/factories/projectConfig.factory.js';
import { RoleSessionJobFileFactory } from '@/tests/factories/roleSessionJobFile.factory.js';

const MINUTE_MS = 60_000;
const launchedAt = new Date('2026-11-27T09:00:00.000Z');
const worktreeRoot = '/home/ai/.reviewflow/worktrees';
const worktree = `${worktreeRoot}/github-acme-app-2111`;

type AgentEntry = { id: string; name: string; cwd: string; startedAt: number; state: string };

function fakeClaude(agents: () => AgentEntry[]): {
  runner: ClaudeProcessRunner;
  calls: Array<{ args: string[]; stdin: string | null }>;
} {
  const calls: Array<{ args: string[]; stdin: string | null }> = [];
  const runner: ClaudeProcessRunner = async ({ args, stdin }) => {
    calls.push({ args, stdin: stdin ?? null });
    if (args[0] === 'agents') {
      return { stdout: JSON.stringify(agents()), stderr: '', exitCode: 0 };
    }
    if (args[0] === '--bg') return { stdout: 'backgrounded · 9f8e7d6c', stderr: '', exitCode: 0 };
    return { stdout: '', stderr: '', exitCode: 0 };
  };
  return { runner, calls };
}

function agent(id: string, name: string, state: string): AgentEntry {
  return { id, name, cwd: worktree, startedAt: launchedAt.getTime(), state };
}

describe('SPEC-236 — orchestrated review mode', () => {
  let root: string;
  let projectPath: string;
  let jobsDirectory: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spec-236-'));
    projectPath = join(root, 'acme-app');
    jobsDirectory = join(root, 'jobs');
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
    mkdirSync(jobsDirectory);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function configureProject(review: Record<string, unknown> | null): void {
    writeFileSync(
      join(projectPath, '.claude', 'reviews', 'config.json'),
      JSON.stringify(ProjectConfigFactory.create(review === null ? {} : { review })),
    );
  }

  function recordJob(roleSessions: Array<{ sessionId: string; role: string }>): void {
    writeFileSync(
      join(jobsDirectory, 'github-acme-app-2111.json'),
      JSON.stringify(
        RoleSessionJobFileFactory.create({
          localPath: projectPath,
          worktreePath: worktree,
          roleSessions: roleSessions.map((session) => ({
            ...session,
            launchedAt: launchedAt.toISOString(),
          })),
        }),
      ),
    );
  }

  async function dispatchReview(jobType: 'review' | 'followup', skill: string) {
    const plan = reviewSessionPlanOf({
      skill,
      mergeRequestNumber: 2111,
      jobType,
      settings: loadReviewOrchestrationSettings(projectPath),
      singleTimeoutMs: 15 * MINUTE_MS,
    });
    const claude = fakeClaude(() => []);
    await new ClaudeSessionCliGateway(claude.runner).dispatch({
      prompt: plan.prompt,
      flags: {
        model: 'sonnet',
        mcpConfigJson: '{}',
        systemPrompt: 'system',
        allowedTools: 'Read',
        disallowedTools: 'AskUserQuestion',
        permissionMode: 'auto',
        sessionName: plan.sessionName,
      },
      localPath: worktree,
      jobId: 'github:acme/app:2111',
      jobType,
    });
    return { plan, call: claude.calls[0] };
  }

  it('runs a review of an orchestrated project as the named clerk on the orchestre argument', async () => {
    configureProject({ mode: 'orchestrated' });

    const { plan, call } = await dispatchReview('review', 'practicio-review-code');

    const args = call?.args ?? [];
    expect(args[args.indexOf('--name') + 1]).toBe('Revue #2111 · greffe');
    expect(call?.stdin).toBe('/practicio-review-code 2111 orchestre');
    expect(plan.timeoutMs).toBe(45 * MINUTE_MS);
  });

  it('keeps the follow-up of an orchestrated project, and any single project, unchanged', async () => {
    configureProject({ mode: 'orchestrated' });
    const followup = await dispatchReview('followup', 'practicio-review-followup');
    configureProject(null);
    const single = await dispatchReview('review', 'review-front');

    expect(followup.call?.args).not.toContain('--name');
    expect(followup.call?.stdin).toBe('/practicio-review-followup 2111');
    expect(single.call?.args).not.toContain('--name');
    expect(single.call?.stdin).toBe('/review-front 2111');
    expect(single.plan.timeoutMs).toBe(15 * MINUTE_MS);
  });

  it('lets a lot message the clerk while keeping it read-only on files', async () => {
    const claude = fakeClaude(() => []);

    await new RoleSessionClaudeCliGateway(claude.runner).launch({
      name: 'Revue #2111 · lot tests',
      model: 'sonnet',
      brief: '# Brief — Revue #2111 · lot tests',
      cwd: worktree,
    });

    const args = claude.calls[0]?.args ?? [];
    expect(args[args.indexOf('--tools') + 1]).toBe('Read,Glob,Grep,SendMessage');
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read,Glob,Grep,SendMessage');
  });

  describe('session await', () => {
    let printed: string[];
    let exitCodes: number[];
    let clock: Date;

    function awaitDependencies(runner: ClaudeProcessRunner): SessionAwaitDependencies {
      return {
        awaitRoleSessions: new AwaitRoleSessionsUseCase({
          roleSessionGateway: new RoleSessionClaudeCliGateway(runner),
          roleSessionJobGateway: new RoleSessionJobFileSystemGateway(jobsDirectory),
          sessionGateway: new ClaudeSessionCliGateway(runner),
          reviewSettingsOf: loadReviewOrchestrationSettings,
          now: () => clock,
          wait: async (milliseconds) => {
            clock = new Date(clock.getTime() + milliseconds);
          },
          pollIntervalMs: 10_000,
        }),
        print: (line) => printed.push(line),
        exit: (code) => exitCodes.push(code),
      };
    }

    beforeEach(() => {
      printed = [];
      exitCodes = [];
      configureProject({ mode: 'orchestrated' });
    });

    it('reports each lot done, failed or timed out, and stops the timed-out one without removing it', async () => {
      clock = new Date(launchedAt.getTime() + 16 * MINUTE_MS);
      recordJob([
        { sessionId: 'aaaa0001', role: 'lot:bugs' },
        { sessionId: 'aaaa0002', role: 'lot:tests' },
        { sessionId: 'aaaa0003', role: 'lot:architecture' },
      ]);
      const claude = fakeClaude(() => [
        agent('aaaa0001', 'Revue #2111 · lot bugs', 'done'),
        agent('aaaa0002', 'Revue #2111 · lot tests', 'failed'),
        agent('aaaa0003', 'Revue #2111 · lot architecture', 'working'),
      ]);

      await executeSessionAwait(
        { job: 'github:acme/app:2111', maxWait: '540' },
        awaitDependencies(claude.runner),
      );

      expect(printed).toEqual([
        'DONE lot:bugs aaaa0001',
        'FAILED lot:tests aaaa0002',
        'TIMEOUT lot:architecture aaaa0003',
      ]);
      expect(exitCodes).toEqual([0]);
      const commands = claude.calls.map((call) => call.args.slice(0, 2).join(' '));
      expect(commands).toContain('stop aaaa0003');
      expect(commands.some((command) => command.startsWith('rm'))).toBe(false);
    });

    it('returns after the maximum wait, silent on a lot still working', async () => {
      clock = new Date(launchedAt.getTime() + 5 * MINUTE_MS);
      recordJob([{ sessionId: 'aaaa0001', role: 'lot:bugs' }]);
      const claude = fakeClaude(() => [agent('aaaa0001', 'Revue #2111 · lot bugs', 'working')]);

      await executeSessionAwait(
        { job: 'github:acme/app:2111', maxWait: '25' },
        awaitDependencies(claude.runner),
      );

      expect(printed).toEqual([]);
      expect(exitCodes).toEqual([0]);
      expect(clock.getTime()).toBe(launchedAt.getTime() + 5 * MINUTE_MS + 25_000);
    });

    it('reads a lot recorded under the retired security role as the bugs lot', async () => {
      clock = new Date(launchedAt.getTime() + 5 * MINUTE_MS);
      recordJob([{ sessionId: 'aaaa0001', role: 'lot:securite' }]);
      const claude = fakeClaude(() => [agent('aaaa0001', 'Revue #2111 · lot sécurité', 'done')]);

      await executeSessionAwait(
        { job: 'github:acme/app:2111', maxWait: null },
        awaitDependencies(claude.runner),
      );

      expect(printed).toEqual(['DONE lot:bugs aaaa0001']);
    });
  });

  it('never sweeps the clerk of a running review as an orphan role session', async () => {
    recordJob([]);
    const claude = fakeClaude(() => [agent('c1e2a3b4', 'Revue #2111 · greffe', 'working')]);
    const sweep = new SweepRoleSessionsUseCase({
      roleSessionGateway: new RoleSessionClaudeCliGateway(claude.runner),
      roleSessionJobGateway: new RoleSessionJobFileSystemGateway(jobsDirectory),
      sessionGateway: new ClaudeSessionCliGateway(claude.runner),
      worktreeRoot,
      now: () => new Date(launchedAt.getTime() + 30 * MINUTE_MS),
      reviewTimeoutMs: () => 45 * MINUTE_MS,
    });

    const result = await sweep.execute({ dryRun: false });

    expect(result).toEqual({ status: 'swept', outcomes: [] });
  });
});
