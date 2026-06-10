import { describe, it, expect } from 'vitest';

import { dispatchClaudeSession } from '@/modules/claude-invocation/usecases/dispatchClaudeSession.usecase.js';
import { StubBillingStateGateway } from '@/tests/stubs/billingState.stub.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';

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
};

describe('dispatchClaudeSession use case', () => {
  it('returns "dispatched" with a session id on the happy path', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    const environment = new StubEnvironmentGateway();
    const billingState = new StubBillingStateGateway();

    const result = await dispatchClaudeSession(baseInput, {
      sessionGateway,
      environment,
      billingState,
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    expect(result.status).toBe('dispatched');
    if (result.status === 'dispatched') {
      expect(result.session.sessionId).toBe('stub-session');
      expect(result.session.status).toBe('dispatched');
    }
    expect(sessionGateway.dispatchCalls).toHaveLength(1);
  });

  it('aborts with "billing-regression-prevented" when ANTHROPIC_API_KEY is present', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    const environment = new StubEnvironmentGateway();
    environment.setHasAnthropicApiKey(true);
    const billingState = new StubBillingStateGateway();

    const result = await dispatchClaudeSession(baseInput, {
      sessionGateway,
      environment,
      billingState,
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    expect(result.status).toBe('billing-regression-prevented');
    expect(sessionGateway.dispatchCalls).toHaveLength(0);
  });

  it('returns "paused" when the billing state is paused', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    const environment = new StubEnvironmentGateway();
    const billingState = new StubBillingStateGateway();
    billingState.pause('regression');

    const result = await dispatchClaudeSession(baseInput, {
      sessionGateway,
      environment,
      billingState,
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    expect(result.status).toBe('paused');
    expect(sessionGateway.dispatchCalls).toHaveLength(0);
  });

  it('returns "rate-limited" when the gateway reports a rate limit', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setDispatchResult({
      status: 'rate-limited',
      rawStderr: '429 Too Many Requests',
    });
    const environment = new StubEnvironmentGateway();
    const billingState = new StubBillingStateGateway();

    const result = await dispatchClaudeSession(baseInput, {
      sessionGateway,
      environment,
      billingState,
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    expect(result.status).toBe('rate-limited');
  });

  it('returns "failed" with raw stderr when dispatch fails', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setDispatchResult({ status: 'failed', rawStderr: 'boom' });
    const environment = new StubEnvironmentGateway();
    const billingState = new StubBillingStateGateway();

    const result = await dispatchClaudeSession(baseInput, {
      sessionGateway,
      environment,
      billingState,
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.rawStderr).toBe('boom');
    }
  });
});
