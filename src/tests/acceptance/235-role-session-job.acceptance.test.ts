/**
 * SPEC-235 lot C — The review job ends its role sessions and accounts their tokens
 *
 * Outer-loop acceptance test (SDD): whatever the outcome of a review job, the role sessions its job
 * file records are measured (one usage record each, carrying the role) then ended, before the job
 * file is deleted; the budget counts those records and the pull request view shows their role.
 * Only the Claude CLI is stubbed.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRoleSessionUsageRecorder } from '@/frameworks/claude/roleSessionUsageRecorder.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { SessionUsageSnapshot } from '@/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.js';
import { RoleSessionJobFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSessionJob.fileSystem.gateway.js';
import { EndJobRoleSessionsUseCase } from '@/modules/claude-invocation/usecases/endJobRoleSessions.usecase.js';
import {
  runClaudeReviewJob,
  type RunClaudeReviewJobInput,
} from '@/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.js';
import { MergeRequestTokenUsagePresenter } from '@/modules/token-accounting/interface-adapters/presenters/mergeRequestTokenUsage.presenter.js';
import { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';
import { GetMergeRequestTokenUsageUseCase } from '@/modules/token-accounting/usecases/getMergeRequestTokenUsage/getMergeRequestTokenUsage.usecase.js';
import { TrackTokenUsageUseCase } from '@/modules/token-accounting/usecases/trackTokenUsage/trackTokenUsage.usecase.js';
import { ReviewJobFactory } from '@/tests/factories/reviewJob.factory.js';
import { RoleSessionJobFileFactory } from '@/tests/factories/roleSessionJobFile.factory.js';
import { StubBillingStateGateway } from '@/tests/stubs/billingState.stub.js';
import { StubBudgetGateway } from '@/tests/stubs/budget.stub.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
import { StubMcpCompletionBridge } from '@/tests/stubs/mcpCompletion.stub.js';
import { StubReviewReportGateway } from '@/tests/stubs/reviewReport.stub.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';

const now = new Date('2026-11-27T12:00:00.000Z');
const job = ReviewJobFactory.createGitHub({
  id: 'github:acme/app:2111',
  projectPath: 'acme/app',
  mrNumber: 2111,
  localPath: '/home/ai/projects/acme-app',
});
const worktreePath = '/home/ai/.reviewflow/worktrees/github-acme-app-2111';

const REVIEW_INPUT: RunClaudeReviewJobInput = {
  jobId: job.id,
  jobType: 'review',
  prompt: '/review-front 2111',
  flags: {
    model: 'opus',
    mcpConfigJson: '{}',
    systemPrompt: 'system',
    allowedTools: 'Read',
    disallowedTools: 'EnterPlanMode',
    permissionMode: 'auto',
  },
  localPath: worktreePath,
  mergeRequestId: 'github-acme/app-2111',
  mergeRequestNumber: 2111,
  attempt: 0,
};

function usageOf(sessionId: string, costUsd: number): SessionUsageSnapshot {
  return {
    sessionId: `${sessionId}-full-uuid`,
    model: 'claude-opus-4-7',
    turns: 4,
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 10,
      cacheReadInputTokens: 900,
      costUsd,
    },
  };
}

describe('SPEC-235 lot C — the review job ends its role sessions', () => {
  let jobsDirectory: string;
  let sessionGateway: StubClaudeSessionGateway;
  let completionBridge: StubMcpCompletionBridge;
  let tokenUsageGateway: StubTokenUsageGateway;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    jobsDirectory = mkdtempSync(join(tmpdir(), 'spec-235-c-'));
    sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setDispatchResult({
      status: 'dispatched',
      sessionId: parseSessionId('main0001'),
    });
    completionBridge = new StubMcpCompletionBridge();
    tokenUsageGateway = new StubTokenUsageGateway();
    writeFileSync(
      join(jobsDirectory, 'github-acme-app-2111.json'),
      JSON.stringify(
        RoleSessionJobFileFactory.create({
          jobId: job.id,
          worktreePath,
          roleSessions: [
            { sessionId: 'greffe01', role: 'greffe', launchedAt: '2026-11-27T11:00:00.000Z' },
            { sessionId: 'bugs0001', role: 'lot:bugs', launchedAt: '2026-11-27T11:05:00.000Z' },
            { sessionId: 'bugs0002', role: 'lot:bugs', launchedAt: '2026-11-27T11:20:00.000Z' },
          ],
        }),
      ),
    );
    sessionGateway.setSessionUsageFor('greffe01', usageOf('greffe01', 0.4));
    sessionGateway.setSessionUsageFor('bugs0001', usageOf('bugs0001', 1.1));
    sessionGateway.setSessionUsageFor('bugs0002', usageOf('bugs0002', 1.5));
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(jobsDirectory, { recursive: true, force: true });
  });

  async function runJob(outcome: 'completed' | 'failed') {
    completionBridge.scheduleCompletion(job.id, { source: 'mcp', outcome, reason: null });
    const reportGateway = new StubReviewReportGateway();
    reportGateway.setReport({ path: '/report.md', content: '# Review' });
    const runPromise = runClaudeReviewJob(REVIEW_INPUT, {
      sessionGateway,
      completionBridge,
      reportGateway,
      billingState: new StubBillingStateGateway(),
      environment: new StubEnvironmentGateway(),
      now: () => now,
      timeoutMs: 15 * 60_000,
      pollIntervalMs: 30_000,
      endJobRoleSessions: new EndJobRoleSessionsUseCase({
        roleSessionJobGateway: new RoleSessionJobFileSystemGateway(jobsDirectory),
        sessionGateway,
        recordRoleSessionUsage: createRoleSessionUsageRecorder({
          job,
          jobType: 'review',
          trackTokenUsage: new TrackTokenUsageUseCase(tokenUsageGateway),
          now: () => now,
        }),
      }),
    });
    await vi.runAllTimersAsync();
    return runPromise;
  }

  it('ends every recorded role session, relaunches included, after a completed review', async () => {
    const result = await runJob('completed');

    expect(result.status).toBe('completed');
    expect(sessionGateway.removeCalls).toEqual(
      expect.arrayContaining(['main0001', 'greffe01', 'bugs0001', 'bugs0002']),
    );
    expect(sessionGateway.stopCalls).toEqual(
      expect.arrayContaining(['greffe01', 'bugs0001', 'bugs0002']),
    );
  });

  it('ends the role sessions of a failed review too', async () => {
    const result = await runJob('failed');

    expect(result.status).toBe('failed');
    expect(sessionGateway.removeCalls).toEqual(
      expect.arrayContaining(['greffe01', 'bugs0001', 'bugs0002']),
    );
  });

  it('records one usage per role session with its role, counted by the budget', async () => {
    await runJob('completed');

    expect(
      tokenUsageGateway.records.map((record) => [
        record.sessionId,
        record.role,
        record.usage.costUsd,
      ]),
    ).toEqual([
      ['greffe01-full-uuid', 'greffe', 0.4],
      ['bugs0001-full-uuid', 'lot:bugs', 1.1],
      ['bugs0002-full-uuid', 'lot:bugs', 1.5],
    ]);
    const budget = await new GetBudgetStatusUseCase({
      budgetGateway: new StubBudgetGateway(),
      tokenUsageGateway,
    }).execute({ localPaths: [job.localPath], now });
    expect(budget.consumedUsd).toBe(3);
  });

  it('shows the role of each session in the pull request consumption view', async () => {
    await runJob('completed');

    const usage = await new GetMergeRequestTokenUsageUseCase(tokenUsageGateway).execute({
      localPaths: [job.localPath],
      project: 'acme/app',
      mrNumber: 2111,
    });
    const viewModel = new MergeRequestTokenUsagePresenter().present(usage);

    expect(viewModel.sessions.map((row) => row.role)).toEqual(['greffe', 'lot bugs', 'lot bugs']);
  });

  it('never lets a failing cleanup change the result of the review', async () => {
    sessionGateway.setStopError(new Error('daemon gone'));
    sessionGateway.setSessionUsageError('bugs0001', new Error('transcript unreadable'));

    const result = await runJob('completed');

    expect(result.status).toBe('completed');
    expect(sessionGateway.removeCalls).toEqual(
      expect.arrayContaining(['greffe01', 'bugs0001', 'bugs0002']),
    );
  });
});
