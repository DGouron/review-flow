import { describe, it, expect, beforeEach, vi } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import { auditBilling } from '@/modules/claude-invocation/usecases/auditBilling.usecase.js';
import { checkSupervisorHealth } from '@/modules/claude-invocation/usecases/checkSupervisorHealth.usecase.js';
import { runClaudeReviewJob } from '@/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.js';
import type { RunClaudeReviewJobDependencies } from '@/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.js';
import { StubBillingStateGateway } from '@/tests/stubs/billingState.stub.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
import { StubMcpCompletionBridge } from '@/tests/stubs/mcpCompletion.stub.js';
import { StubReviewReportGateway } from '@/tests/stubs/reviewReport.stub.js';
import { StubSupervisorHealthGateway } from '@/tests/stubs/supervisorHealth.stub.js';

interface AcceptanceContext {
  sessionGateway: StubClaudeSessionGateway;
  completionBridge: StubMcpCompletionBridge;
  reportGateway: StubReviewReportGateway;
  billingState: StubBillingStateGateway;
  supervisorHealth: StubSupervisorHealthGateway;
  environment: StubEnvironmentGateway;
  deps: RunClaudeReviewJobDependencies;
}

function createContext(): AcceptanceContext {
  const sessionGateway = new StubClaudeSessionGateway();
  const completionBridge = new StubMcpCompletionBridge();
  const reportGateway = new StubReviewReportGateway();
  const billingState = new StubBillingStateGateway();
  const supervisorHealth = new StubSupervisorHealthGateway();
  const environment = new StubEnvironmentGateway();
  const deps: RunClaudeReviewJobDependencies = {
    sessionGateway,
    completionBridge,
    reportGateway,
    billingState,
    environment,
    now: () => new Date('2026-05-22T10:00:00Z'),
    timeoutMs: 15 * 60 * 1000,
    pollIntervalMs: 30_000,
  };
  return {
    sessionGateway,
    completionBridge,
    reportGateway,
    billingState,
    supervisorHealth,
    environment,
    deps,
  };
}

const baseInput = {
  jobId: 'gitlab:owner/repo:42',
  jobType: 'review' as const,
  prompt: '/review-front 42',
  flags: {
    model: 'claude-opus-4-7',
    mcpConfigJson: '{}',
    systemPrompt: 'system',
    allowedTools: 'Read,Bash',
    disallowedTools: 'EnterPlanMode',
    permissionMode: 'auto' as const,
  },
  localPath: '/tmp/project',
  mergeRequestId: 'gitlab-owner/repo-42',
  mergeRequestNumber: 42,
  attempt: 0,
};

describe('SPEC-169: Migrate Claude invocation to --bg mode (acceptance)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T10:00:00Z'));
  });

  describe('Scenario 1: Webhook triggers review dispatched via --bg', () => {
    it('spawns claude --bg with the configured flags and captures the session ID', async () => {
      const context = createContext();
      context.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('7c5dcf5d'),
      });
      context.completionBridge.scheduleCompletion(baseInput.jobId, {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      context.reportGateway.setReport({
        content: '# Review report',
        path: '/tmp/project/.claude/reviews/2026-05-22-MR-42-review.md',
      });

      const runPromise = runClaudeReviewJob(baseInput, context.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;

      expect(result.status).toBe('completed');
      const calls = context.sessionGateway.dispatchCalls;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.flags.permissionMode).toBe('auto');
      expect(JSON.stringify(calls[0])).not.toContain('-p ');
      expect(JSON.stringify(calls[0])).not.toContain('--print');
    });
  });

  describe('Scenario 2: Completion via MCP primary signal', () => {
    it('reads the report from the conventional path, then stops and removes the session', async () => {
      const context = createContext();
      context.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('abc12345'),
      });
      context.completionBridge.scheduleCompletion(baseInput.jobId, {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      context.reportGateway.setReport({
        content: '# Review content',
        path: '/tmp/project/.claude/reviews/2026-05-22-MR-42-review.md',
      });

      const runPromise = runClaudeReviewJob(baseInput, context.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.content).toBe('# Review content');
      }
      expect(context.sessionGateway.stopCalls).toContain('abc12345');
      expect(context.sessionGateway.removeCalls).toContain('abc12345');
    });
  });

  describe('Scenario 3: Completion via polling fallback', () => {
    it('detects completion through claude agents --json when MCP stays silent', async () => {
      const context = createContext();
      context.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('poll0001'),
      });
      context.sessionGateway.scheduleAgentCompletion('poll0001', 'completed', 1);
      context.reportGateway.setReport({
        content: '# Polled report',
        path: '/tmp/project/.claude/reviews/2026-05-22-MR-42-review.md',
      });

      const runPromise = runClaudeReviewJob(baseInput, context.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;

      expect(result.status).toBe('completed');
      expect(context.sessionGateway.stopCalls).toContain('poll0001');
      expect(context.sessionGateway.removeCalls).toContain('poll0001');
    });
  });

  describe('Scenario 4: Hard timeout reached without completion signal', () => {
    it('marks the job failed with reason "timeout" after 15 minutes', async () => {
      const context = createContext();
      context.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('time0001'),
      });
      let nowMs = new Date('2026-05-22T10:00:00Z').getTime();
      const deps = { ...context.deps, now: (): Date => new Date(nowMs) };

      const runPromise = runClaudeReviewJob(baseInput, deps);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      nowMs += 16 * 60 * 1000;
      await vi.advanceTimersByTimeAsync(16 * 60 * 1000);
      const result = await runPromise;

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.reason).toBe('timeout');
      }
      expect(context.sessionGateway.stopCalls).toContain('time0001');
      expect(context.sessionGateway.removeCalls).toContain('time0001');
    });
  });

  describe('Scenario 5: Report file missing after completion', () => {
    it('fails the job with reason "report-missing" and still runs cleanup', async () => {
      const context = createContext();
      context.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('rep00001'),
      });
      context.completionBridge.scheduleCompletion(baseInput.jobId, {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      context.reportGateway.setReport(null);

      const runPromise = runClaudeReviewJob(baseInput, context.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.reason).toBe('report-missing');
      }
      expect(context.sessionGateway.stopCalls).toContain('rep00001');
    });
  });

  describe('Scenario 6: Rate limit error on dispatch', () => {
    it('returns a retry signal with exponential backoff', async () => {
      const context = createContext();
      context.sessionGateway.setDispatchResult({
        status: 'rate-limited',
        rawStderr: '429 Too Many Requests',
      });

      const result = await runClaudeReviewJob(baseInput, context.deps);

      expect(result.status).toBe('retry');
      if (result.status === 'retry') {
        expect(result.delayMs).toBe(60_000);
        expect(result.attempt).toBe(1);
      }
    });
  });

  describe('Scenario 7: Supervisor down detection', () => {
    it('records supervisor down status when daemon is unreachable', async () => {
      const context = createContext();
      context.sessionGateway.setDaemonStatus({ reachable: false, reason: 'connection refused' });

      const health = await checkSupervisorHealth({
        sessionGateway: context.sessionGateway,
        supervisorHealthGateway: context.supervisorHealth,
        now: () => new Date('2026-05-22T10:00:00Z'),
      });

      expect(health.status).toBe('down');
      expect(context.supervisorHealth.read().status).toBe('down');
    });
  });

  describe('Scenario 8: Billing regression detected pre-dispatch', () => {
    it('aborts dispatch when ANTHROPIC_API_KEY is present in the environment', async () => {
      const context = createContext();
      context.environment.setHasAnthropicApiKey(true);

      const result = await runClaudeReviewJob(baseInput, context.deps);

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.reason).toBe('billing-regression-prevented');
      }
      expect(context.sessionGateway.dispatchCalls).toHaveLength(0);
    });
  });

  describe('Scenario 9: Periodic billing audit never pauses on usage heuristics', () => {
    it('does not pause the dispatch queue regardless of usage output (heuristic removed — only env var ANTHROPIC_API_KEY pauses dispatch, see dispatchClaudeSession.usecase.ts)', async () => {
      const context = createContext();
      context.sessionGateway.setUsage({ usesApiPool: true, raw: 'API tokens used: 12345' });

      const result = await auditBilling({
        billingStateGateway: context.billingState,
        now: () => new Date('2026-05-22T10:00:00Z'),
      });

      expect(result.regression).toBe(false);
      expect(context.billingState.read().dispatchPaused).toBe(false);
      expect(context.billingState.read().lastAuditAt).toBe('2026-05-22T10:00:00.000Z');
    });
  });

  describe('Scenario 10: Followup job uses same --bg dispatch path', () => {
    it('runs the followup through the same use case with jobType="followup"', async () => {
      const context = createContext();
      context.sessionGateway.setDispatchResult({
        status: 'dispatched',
        sessionId: parseSessionId('foll0001'),
      });
      context.completionBridge.scheduleCompletion(baseInput.jobId, {
        source: 'mcp',
        outcome: 'completed',
        reason: null,
      });
      context.reportGateway.setReport({
        content: '# Followup report',
        path: '/tmp/project/.claude/reviews/2026-05-22-MR-42-followup.md',
      });

      const runPromise = runClaudeReviewJob({ ...baseInput, jobType: 'followup' }, context.deps);
      await vi.runAllTimersAsync();
      const result = await runPromise;

      expect(result.status).toBe('completed');
      expect(context.reportGateway.lastReadJobType).toBe('followup');
    });
  });
});
