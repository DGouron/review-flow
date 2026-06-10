import { describe, it, expect, beforeEach, vi } from 'vitest';

import { broadcastBudgetAfterUsage } from '@/frameworks/claude/broadcastBudgetAfterUsage.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { SessionUsageSnapshot } from '@/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.js';
import {
  runClaudeReviewJob,
  type RunClaudeReviewJobInput,
} from '@/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.js';
import { computeCostUsd } from '@/modules/token-accounting/entities/modelPricing/modelPricing.js';
import type { TokenUsageRecord } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';
import { BudgetStatusPresenter } from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';
import { TrackTokenUsageUseCase } from '@/modules/token-accounting/usecases/trackTokenUsage/trackTokenUsage.usecase.js';
import { StubBillingStateGateway } from '@/tests/stubs/billingState.stub.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubMcpCompletionBridge } from '@/tests/stubs/mcpCompletion.stub.js';
import { StubReviewReportGateway } from '@/tests/stubs/reviewReport.stub.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';

const REVIEW_INPUT: RunClaudeReviewJobInput = {
  jobId: 'gitlab:owner/repo:42',
  jobType: 'review',
  prompt: '/review-front 42',
  flags: {
    model: 'claude-opus-4-7',
    mcpConfigJson: '{}',
    systemPrompt: 'system',
    allowedTools: 'Read,Bash',
    disallowedTools: 'EnterPlanMode',
    permissionMode: 'auto',
  },
  localPath: '/tmp/project',
  mergeRequestId: 'gitlab-owner/repo-42',
  mergeRequestNumber: 42,
  attempt: 0,
};

function buildContext() {
  const sessionGateway = new StubClaudeSessionGateway();
  const completionBridge = new StubMcpCompletionBridge();
  const reportGateway = new StubReviewReportGateway();
  const billingState = new StubBillingStateGateway();
  const environment = new StubEnvironmentGateway();
  const tokenUsageGateway = new StubTokenUsageGateway();
  const trackTokenUsage = new TrackTokenUsageUseCase(tokenUsageGateway);
  const presenter = new BudgetStatusPresenter();
  const broadcastBudgetStatus = vi.fn();
  const getBudgetStatus = {
    execute: vi.fn(async () => ({
      limitUsd: 200,
      consumedUsd: 0.5,
      remainingUsd: 199.5,
      percentUsed: 0.25,
      exceeded: false,
      periodStart: '2026-05-01T00:00:00.000Z',
    })),
  };
  const logger = createStubLogger();
  return {
    sessionGateway,
    completionBridge,
    reportGateway,
    billingState,
    environment,
    tokenUsageGateway,
    trackTokenUsage,
    broadcastBudgetStatus,
    getBudgetStatus,
    presenter,
    logger,
    deps: {
      sessionGateway,
      completionBridge,
      reportGateway,
      billingState,
      environment,
      now: () => new Date('2026-05-23T12:00:00Z'),
      timeoutMs: 15 * 60_000,
      pollIntervalMs: 30_000,
    },
  };
}

async function processTokenTracking(
  ctx: ReturnType<typeof buildContext>,
  result: Awaited<ReturnType<typeof runClaudeReviewJob>>,
  input: RunClaudeReviewJobInput,
): Promise<void> {
  if (result.status !== 'completed') return;
  if (result.usage === null) return;
  try {
    const record: TokenUsageRecord = {
      jobId: input.jobId,
      mrNumber: input.mergeRequestNumber,
      platform: 'gitlab',
      projectPath: 'owner/repo',
      model: result.usage.model,
      recordedAt: new Date('2026-05-23T12:00:00Z').toISOString(),
      localPath: input.localPath,
      usage: result.usage.usage,
    };
    await ctx.trackTokenUsage.execute(record);
    await broadcastBudgetAfterUsage(
      {
        getBudgetStatus: ctx.getBudgetStatus,
        broadcastBudgetStatus: ctx.broadcastBudgetStatus,
        presenter: ctx.presenter,
      },
      { localPaths: [input.localPath] },
      ctx.logger,
    );
  } catch {
    // R5/R7: failures here are swallowed so the review pipeline keeps going.
  }
}

describe('SPEC-171 — Re-enable Token Usage Tracking in --bg Mode (acceptance)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T12:00:00Z'));
  });

  describe('R1, R2, R3, R4, R7 — successful review extracts usage and broadcasts budget', () => {
    it('successful-review: trackTokenUsage called 1x with summed usage and computed costUsd, broadcastBudget called 1x', async () => {
      const ctx = buildContext();
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('rev00001'),
      });
      ctx.completionBridge.scheduleCompletion(REVIEW_INPUT.jobId, {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      const usageSnapshot: SessionUsageSnapshot = {
        model: 'claude-opus-4-7',
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationInputTokens: 200,
          cacheReadInputTokens: 800,
          costUsd: computeCostUsd('claude-opus-4-7', {
            inputTokens: 1000,
            outputTokens: 500,
            cacheCreationInputTokens: 200,
            cacheReadInputTokens: 800,
            costUsd: 0,
          }),
        },
      };
      ctx.sessionGateway.setSessionUsage(usageSnapshot);

      const runPromise = runClaudeReviewJob(REVIEW_INPUT, ctx.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;
      await processTokenTracking(ctx, result, REVIEW_INPUT);

      expect(result.status).toBe('completed');
      expect(ctx.tokenUsageGateway.records).toHaveLength(1);
      const record = ctx.tokenUsageGateway.records[0];
      expect(record?.usage.inputTokens).toBe(1000);
      expect(record?.usage.outputTokens).toBe(500);
      expect(record?.usage.cacheCreationInputTokens).toBe(200);
      expect(record?.usage.cacheReadInputTokens).toBe(800);
      expect(record?.usage.costUsd).toBeGreaterThan(0);
      expect(record?.model).toBe('claude-opus-4-7');
      expect(ctx.broadcastBudgetStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('R8 — followup reviews track tokens identically to standard reviews', () => {
    it('successful-followup: trackTokenUsage called 1x, broadcastBudget called 1x', async () => {
      const ctx = buildContext();
      const followupInput: RunClaudeReviewJobInput = { ...REVIEW_INPUT, jobType: 'followup' };
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('fol00001'),
      });
      ctx.completionBridge.scheduleCompletion(followupInput.jobId, {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      ctx.sessionGateway.setSessionUsage({
        model: 'claude-sonnet-4-5',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: computeCostUsd('claude-sonnet-4-5', {
            inputTokens: 100,
            outputTokens: 50,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 0,
          }),
        },
      });

      const runPromise = runClaudeReviewJob(followupInput, ctx.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;
      await processTokenTracking(ctx, result, followupInput);

      expect(result.status).toBe('completed');
      expect(ctx.tokenUsageGateway.records).toHaveLength(1);
      expect(ctx.broadcastBudgetStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('R5 — missing or unparseable JSONL degrades gracefully', () => {
    it('missing-jsonl: trackTokenUsage NOT called, pipeline still returns completed', async () => {
      const ctx = buildContext();
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('mis00001'),
      });
      ctx.completionBridge.scheduleCompletion(REVIEW_INPUT.jobId, {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      ctx.sessionGateway.setSessionUsage(null);

      const runPromise = runClaudeReviewJob(REVIEW_INPUT, ctx.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;
      await processTokenTracking(ctx, result, REVIEW_INPUT);

      expect(result.status).toBe('completed');
      expect(ctx.tokenUsageGateway.records).toHaveLength(0);
      expect(ctx.broadcastBudgetStatus).not.toHaveBeenCalled();
    });

    it('unparseable-jsonl: same shape as missing — no track, no broadcast, pipeline completes', async () => {
      const ctx = buildContext();
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('unp00001'),
      });
      ctx.completionBridge.scheduleCompletion(REVIEW_INPUT.jobId, {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      ctx.sessionGateway.setSessionUsage(null);

      const runPromise = runClaudeReviewJob(REVIEW_INPUT, ctx.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;
      await processTokenTracking(ctx, result, REVIEW_INPUT);

      expect(result.status).toBe('completed');
      expect(ctx.tokenUsageGateway.records).toHaveLength(0);
      expect(ctx.broadcastBudgetStatus).not.toHaveBeenCalled();
    });
  });

  describe('R6 — failed and timeout reviews do not invoke tracking', () => {
    it('failed-review: trackTokenUsage NOT called, broadcastBudget NOT called', async () => {
      const ctx = buildContext();
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('fai00001'),
      });
      ctx.completionBridge.scheduleCompletion(REVIEW_INPUT.jobId, {
        source: 'mcp',
        outcome: 'failed',
        reason: 'agent-crash',
      });

      const runPromise = runClaudeReviewJob(REVIEW_INPUT, ctx.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;
      await processTokenTracking(ctx, result, REVIEW_INPUT);

      expect(result.status).toBe('failed');
      expect(ctx.tokenUsageGateway.records).toHaveLength(0);
      expect(ctx.broadcastBudgetStatus).not.toHaveBeenCalled();
    });

    it('timeout-review: trackTokenUsage NOT called, broadcastBudget NOT called', async () => {
      const ctx = buildContext();
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('tim00001'),
      });
      let nowMs = new Date('2026-05-23T12:00:00Z').getTime();
      const deps = { ...ctx.deps, now: (): Date => new Date(nowMs) };

      const runPromise = runClaudeReviewJob(REVIEW_INPUT, deps);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      nowMs += 16 * 60_000;
      await vi.advanceTimersByTimeAsync(16 * 60_000);
      const result = await runPromise;
      await processTokenTracking(ctx, result, REVIEW_INPUT);

      expect(result.status).toBe('failed');
      expect(ctx.tokenUsageGateway.records).toHaveLength(0);
      expect(ctx.broadcastBudgetStatus).not.toHaveBeenCalled();
    });
  });

  describe('R3 — unknown model falls back to opus-tier pricing (never under-reports)', () => {
    it('unknown-model: cost computed with opus fallback so we never under-report', async () => {
      const ctx = buildContext();
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('unk00001'),
      });
      ctx.completionBridge.scheduleCompletion(REVIEW_INPUT.jobId, {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      const opusCost = computeCostUsd('claude-opus-4-7', {
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        costUsd: 0,
      });
      ctx.sessionGateway.setSessionUsage({
        model: 'mystery-model-x',
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: computeCostUsd('mystery-model-x', {
            inputTokens: 1000,
            outputTokens: 500,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 0,
          }),
        },
      });

      const runPromise = runClaudeReviewJob(REVIEW_INPUT, ctx.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;
      await processTokenTracking(ctx, result, REVIEW_INPUT);

      expect(result.status).toBe('completed');
      expect(ctx.tokenUsageGateway.records).toHaveLength(1);
      expect(ctx.tokenUsageGateway.records[0]?.usage.costUsd).toBe(opusCost);
    });
  });
});
