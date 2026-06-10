import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { startClaudeInvocationTimers } from '@/frameworks/claude/timers/claudeInvocationTimers.js';
import { StubBillingStateGateway } from '@/tests/stubs/billingState.stub.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubSupervisorHealthGateway } from '@/tests/stubs/supervisorHealth.stub.js';

describe('startClaudeInvocationTimers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs supervisor health check at the configured interval', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setDaemonStatus({ reachable: true, reason: null });
    const supervisorHealthGateway = new StubSupervisorHealthGateway();
    const billingStateGateway = new StubBillingStateGateway();

    const stop = startClaudeInvocationTimers({
      sessionGateway,
      supervisorHealthGateway,
      billingStateGateway,
      now: () => new Date('2026-05-22T10:00:00Z'),
      supervisorIntervalMs: 5 * 60_000,
      billingIntervalMs: 60 * 60_000,
    });

    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(supervisorHealthGateway.read().lastCheckAt).not.toBeNull();
    stop();
  });

  it('runs billing audit at the configured interval and records audit time (audit no longer pauses on heuristics)', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    const supervisorHealthGateway = new StubSupervisorHealthGateway();
    const billingStateGateway = new StubBillingStateGateway();

    const stop = startClaudeInvocationTimers({
      sessionGateway,
      supervisorHealthGateway,
      billingStateGateway,
      now: () => new Date('2026-05-22T10:00:00Z'),
      supervisorIntervalMs: 5 * 60_000,
      billingIntervalMs: 60 * 60_000,
    });

    await vi.advanceTimersByTimeAsync(60 * 60_000);

    expect(billingStateGateway.read().dispatchPaused).toBe(false);
    expect(billingStateGateway.read().lastAuditAt).toBe('2026-05-22T10:00:00.000Z');
    stop();
  });

  it('stops both timers when the returned dispose function is called', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setDaemonStatus({ reachable: true, reason: null });
    const supervisorHealthGateway = new StubSupervisorHealthGateway();
    const billingStateGateway = new StubBillingStateGateway();

    const stop = startClaudeInvocationTimers({
      sessionGateway,
      supervisorHealthGateway,
      billingStateGateway,
      now: () => new Date('2026-05-22T10:00:00Z'),
      supervisorIntervalMs: 5 * 60_000,
      billingIntervalMs: 60 * 60_000,
    });
    stop();

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(supervisorHealthGateway.read().lastCheckAt).toBeNull();
  });
});
