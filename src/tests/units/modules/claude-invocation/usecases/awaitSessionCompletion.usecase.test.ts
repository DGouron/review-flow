import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  AgentStatusEntry,
  AgentStatusValue,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import { awaitSessionCompletion } from '@/modules/claude-invocation/usecases/awaitSessionCompletion.usecase.js';
import { ClaudeSessionFactory } from '@/tests/factories/claudeSession.factory.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubMcpCompletionBridge } from '@/tests/stubs/mcpCompletion.stub.js';

describe('awaitSessionCompletion use case', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T10:00:00Z'));
  });

  it('returns the MCP completion when it arrives first', async () => {
    const session = ClaudeSessionFactory.create({ sessionId: parseSessionId('mcp00001') });
    const bridge = new StubMcpCompletionBridge();
    const sessionGateway = new StubClaudeSessionGateway();
    bridge.scheduleCompletion(session.jobId, {
      source: 'mcp',
      outcome: 'completed',
      reason: null,
    });

    const promise = awaitSessionCompletion(
      { session, timeoutMs: 60_000, pollIntervalMs: 30_000 },
      { sessionGateway, completionBridge: bridge, now: () => new Date('2026-05-22T10:00:00Z') },
    );
    await vi.runAllTimersAsync();
    const completion = await promise;

    expect(completion.source).toBe('mcp');
    expect(completion.outcome).toBe('completed');
  });

  it('returns the polling completion when MCP stays silent', async () => {
    const session = ClaudeSessionFactory.create({ sessionId: parseSessionId('poll0002') });
    const bridge = new StubMcpCompletionBridge();
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.scheduleAgentCompletion('poll0002', 'completed', 1);

    const promise = awaitSessionCompletion(
      { session, timeoutMs: 60_000, pollIntervalMs: 30_000 },
      { sessionGateway, completionBridge: bridge, now: () => new Date('2026-05-22T10:00:00Z') },
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const completion = await promise;

    expect(completion.source).toBe('polling');
    expect(completion.outcome).toBe('completed');
  });

  it('maps a stopped agent status to a stopped polling outcome', async () => {
    const session = ClaudeSessionFactory.create({ sessionId: parseSessionId('stop0003') });
    const bridge = new StubMcpCompletionBridge();
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.scheduleAgentCompletion('stop0003', 'stopped', 1);

    const promise = awaitSessionCompletion(
      { session, timeoutMs: 60_000, pollIntervalMs: 30_000 },
      { sessionGateway, completionBridge: bridge, now: () => new Date('2026-05-22T10:00:00Z') },
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const completion = await promise;

    expect(completion.source).toBe('polling');
    expect(completion.outcome).toBe('stopped');
    expect(completion.reason).toBeNull();
  });

  it('maps a failed agent status to a failed polling outcome', async () => {
    const session = ClaudeSessionFactory.create({ sessionId: parseSessionId('fail0004') });
    const bridge = new StubMcpCompletionBridge();
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.scheduleAgentCompletion('fail0004', 'failed', 1);

    const promise = awaitSessionCompletion(
      { session, timeoutMs: 60_000, pollIntervalMs: 30_000 },
      { sessionGateway, completionBridge: bridge, now: () => new Date('2026-05-22T10:00:00Z') },
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const completion = await promise;

    expect(completion.source).toBe('polling');
    expect(completion.outcome).toBe('failed');
    expect(completion.reason).toBeNull();
  });

  it('keeps polling while the agent is still running, then settles when it completes', async () => {
    const session = ClaudeSessionFactory.create({ sessionId: parseSessionId('run00005') });
    const bridge = new StubMcpCompletionBridge();
    class RunningThenDoneSessionGateway extends StubClaudeSessionGateway {
      override async listAgents(): Promise<AgentStatusEntry[]> {
        const call = this.listAgentsCallCount + 1;
        await super.listAgents();
        const status: AgentStatusValue = call === 1 ? 'running' : 'completed';
        return [{ sessionId: session.sessionId, status }];
      }
    }
    const sessionGateway = new RunningThenDoneSessionGateway();

    const promise = awaitSessionCompletion(
      { session, timeoutMs: 60_000, pollIntervalMs: 10_000 },
      { sessionGateway, completionBridge: bridge, now: () => new Date('2026-05-22T10:00:00Z') },
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sessionGateway.listAgentsCallCount).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    const completion = await promise;

    expect(completion.source).toBe('polling');
    expect(completion.outcome).toBe('completed');
  });

  it('treats a listAgents error as non-fatal and retries on the next tick', async () => {
    const session = ClaudeSessionFactory.create({ sessionId: parseSessionId('errr0006') });
    const bridge = new StubMcpCompletionBridge();
    class ThrowOnceSessionGateway extends StubClaudeSessionGateway {
      private hasThrown = false;
      override async listAgents() {
        if (!this.hasThrown) {
          this.hasThrown = true;
          throw new Error('daemon unreachable');
        }
        return super.listAgents();
      }
    }
    const sessionGateway = new ThrowOnceSessionGateway();
    sessionGateway.scheduleAgentCompletion('errr0006', 'completed', 1);

    const promise = awaitSessionCompletion(
      { session, timeoutMs: 60_000, pollIntervalMs: 10_000 },
      { sessionGateway, completionBridge: bridge, now: () => new Date('2026-05-22T10:00:00Z') },
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    const completion = await promise;

    expect(completion.source).toBe('polling');
    expect(completion.outcome).toBe('completed');
  });

  it('returns timeout when no signal arrives within the timeout window', async () => {
    const session = ClaudeSessionFactory.create({ sessionId: parseSessionId('time0002') });
    const bridge = new StubMcpCompletionBridge();
    const sessionGateway = new StubClaudeSessionGateway();
    let nowMs = new Date('2026-05-22T10:00:00Z').getTime();
    const now = (): Date => new Date(nowMs);

    const promise = awaitSessionCompletion(
      { session, timeoutMs: 15 * 60_000, pollIntervalMs: 30_000 },
      { sessionGateway, completionBridge: bridge, now },
    );
    nowMs += 16 * 60_000;
    await vi.advanceTimersByTimeAsync(16 * 60_000);
    const completion = await promise;

    expect(completion.source).toBe('timeout');
    expect(completion.outcome).toBe('failed');
    expect(completion.reason).toBe('timeout');
  });
});
