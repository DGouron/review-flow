import { describe, it, expect, beforeEach, vi } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import { runClaudeReviewJob } from '@/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.js';
import { StubBillingStateGateway } from '@/tests/stubs/billingState.stub.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
import { StubMcpCompletionBridge } from '@/tests/stubs/mcpCompletion.stub.js';
import { StubReviewReportGateway } from '@/tests/stubs/reviewReport.stub.js';

function buildInput(
  overrides: Partial<Parameters<typeof runClaudeReviewJob>[0]> = {},
): Parameters<typeof runClaudeReviewJob>[0] {
  return {
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
    ...overrides,
  };
}

function buildDeps() {
  const sessionGateway = new StubClaudeSessionGateway();
  const completionBridge = new StubMcpCompletionBridge();
  const reportGateway = new StubReviewReportGateway();
  const billingState = new StubBillingStateGateway();
  const environment = new StubEnvironmentGateway();
  return {
    sessionGateway,
    completionBridge,
    reportGateway,
    billingState,
    environment,
    deps: {
      sessionGateway,
      completionBridge,
      reportGateway,
      billingState,
      environment,
      now: () => new Date('2026-05-22T10:00:00Z'),
      timeoutMs: 15 * 60_000,
      pollIntervalMs: 30_000,
    },
  };
}

describe('runClaudeReviewJob orchestrator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T10:00:00Z'));
  });

  it('completes the happy path via MCP signal', async () => {
    const ctx = buildDeps();
    ctx.sessionGateway.setDispatchResult({
      status: 'dispatched',
      sessionId: parseSessionId('happy001'),
    });
    ctx.completionBridge.scheduleCompletion('gitlab:owner/repo:42', {
      source: 'mcp',
      outcome: 'completed',
      reason: null,
    });

    const runPromise = runClaudeReviewJob(buildInput(), ctx.deps);
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(result.status).toBe('completed');
    expect(ctx.sessionGateway.stopCalls).toContain(parseSessionId('happy001'));
    expect(ctx.sessionGateway.removeCalls).toContain(parseSessionId('happy001'));
  });

  it('returns "failed" with reason "report-missing" when the report file is absent for a review job', async () => {
    const ctx = buildDeps();
    ctx.sessionGateway.setDispatchResult({
      status: 'dispatched',
      sessionId: parseSessionId('miss0001'),
    });
    ctx.completionBridge.scheduleCompletion('gitlab:owner/repo:42', {
      source: 'mcp',
      outcome: 'completed',
      reason: null,
    });
    ctx.reportGateway.setReport(null);

    const runPromise = runClaudeReviewJob(buildInput(), ctx.deps);
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toBe('report-missing');
    }
    expect(ctx.sessionGateway.stopCalls).toContain(parseSessionId('miss0001'));
  });

  it('returns "completed" with empty content when the report file is absent for a followup job', async () => {
    const ctx = buildDeps();
    ctx.sessionGateway.setDispatchResult({
      status: 'dispatched',
      sessionId: parseSessionId('flwm0001'),
    });
    ctx.completionBridge.scheduleCompletion('gitlab:owner/repo:42', {
      source: 'mcp',
      outcome: 'completed',
      reason: null,
    });
    ctx.reportGateway.setReport(null);

    const runPromise = runClaudeReviewJob(buildInput({ jobType: 'followup' }), ctx.deps);
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.content).toBe('');
    }
  });

  it('returns "retry" with backoff when the gateway reports a rate limit', async () => {
    const ctx = buildDeps();
    ctx.sessionGateway.setDispatchResult({
      status: 'rate-limited',
      rawStderr: 'rate-limit hit',
    });

    const result = await runClaudeReviewJob(buildInput(), ctx.deps);

    expect(result.status).toBe('retry');
    if (result.status === 'retry') {
      expect(result.delayMs).toBe(60_000);
      expect(result.attempt).toBe(1);
    }
  });

  it('returns "failed" with reason "billing-regression-prevented" when API key is set', async () => {
    const ctx = buildDeps();
    ctx.environment.setHasAnthropicApiKey(true);

    const result = await runClaudeReviewJob(buildInput(), ctx.deps);

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toBe('billing-regression-prevented');
    }
    expect(ctx.sessionGateway.dispatchCalls).toHaveLength(0);
  });

  it('cancels a running session when the AbortSignal fires', async () => {
    const ctx = buildDeps();
    ctx.sessionGateway.setDispatchResult({
      status: 'dispatched',
      sessionId: parseSessionId('abort001'),
    });
    const controller = new AbortController();

    const runPromise = runClaudeReviewJob(buildInput({ signal: controller.signal }), ctx.deps);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(ctx.sessionGateway.stopCalls).toContain(parseSessionId('abort001'));
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toContain('stopped');
    }
  });

  it('skips dispatch entirely when the AbortSignal is already aborted', async () => {
    const ctx = buildDeps();
    const controller = new AbortController();
    controller.abort();

    const result = await runClaudeReviewJob(buildInput({ signal: controller.signal }), ctx.deps);

    expect(ctx.sessionGateway.dispatchCalls).toHaveLength(0);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toContain('cancelled');
    }
  });

  describe('SPEC-171 — session usage capture between completion and cleanup', () => {
    it('calls getSessionUsage once when outcome is completed and returns the snapshot in the result', async () => {
      const ctx = buildDeps();
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('usg00001'),
      });
      ctx.completionBridge.scheduleCompletion('gitlab:owner/repo:42', {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      ctx.sessionGateway.setSessionUsage({
        model: 'claude-opus-4-7',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0019,
        },
      });

      const runPromise = runClaudeReviewJob(buildInput(), ctx.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;

      expect(ctx.sessionGateway.getSessionUsageCalls).toHaveLength(1);
      expect(ctx.sessionGateway.getSessionUsageCalls[0]?.sessionId).toBe(
        parseSessionId('usg00001'),
      );
      expect(ctx.sessionGateway.getSessionUsageCalls[0]?.cwd).toBe('/tmp/project');
      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.usage).not.toBeNull();
        expect(result.usage?.model).toBe('claude-opus-4-7');
        expect(result.usage?.usage.inputTokens).toBe(100);
      }
    });

    it('returns usage null in the completed result when the gateway returns null', async () => {
      const ctx = buildDeps();
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('usg00002'),
      });
      ctx.completionBridge.scheduleCompletion('gitlab:owner/repo:42', {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      ctx.sessionGateway.setSessionUsage(null);

      const runPromise = runClaudeReviewJob(buildInput(), ctx.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.usage).toBeNull();
      }
    });

    it('does NOT call getSessionUsage when outcome is failed', async () => {
      const ctx = buildDeps();
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('usg00003'),
      });
      ctx.completionBridge.scheduleCompletion('gitlab:owner/repo:42', {
        source: 'mcp',
        outcome: 'failed',
        reason: 'agent-crash',
      });

      const runPromise = runClaudeReviewJob(buildInput(), ctx.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;

      expect(ctx.sessionGateway.getSessionUsageCalls).toHaveLength(0);
      expect(result.status).toBe('failed');
    });

    it('does NOT call getSessionUsage on timeout', async () => {
      const ctx = buildDeps();
      ctx.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('usg00004'),
      });
      let nowMs = new Date('2026-05-22T10:00:00Z').getTime();
      const deps = { ...ctx.deps, now: (): Date => new Date(nowMs) };

      const runPromise = runClaudeReviewJob(buildInput(), deps);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      nowMs += 16 * 60_000;
      await vi.advanceTimersByTimeAsync(16 * 60_000);
      await runPromise;

      expect(ctx.sessionGateway.getSessionUsageCalls).toHaveLength(0);
    });
  });

  it('returns "failed" with reason "timeout" when no signal arrives in time', async () => {
    const ctx = buildDeps();
    ctx.sessionGateway.setDispatchResult({
      status: 'dispatched',
      sessionId: parseSessionId('time0003'),
    });
    let nowMs = new Date('2026-05-22T10:00:00Z').getTime();
    const deps = { ...ctx.deps, now: (): Date => new Date(nowMs) };

    const runPromise = runClaudeReviewJob(buildInput(), deps);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    nowMs += 16 * 60_000;
    await vi.advanceTimersByTimeAsync(16 * 60_000);
    const result = await runPromise;

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toBe('timeout');
    }
    expect(ctx.sessionGateway.stopCalls).toContain(parseSessionId('time0003'));
  });
});
