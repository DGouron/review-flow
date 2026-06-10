import { describe, it, expect } from 'vitest';

import { InMemoryBillingStateGateway } from '@/modules/claude-invocation/interface-adapters/gateways/billingState.memory.gateway.js';

describe('InMemoryBillingStateGateway', () => {
  it('starts in dispatchPaused = false', () => {
    const gateway = new InMemoryBillingStateGateway();

    expect(gateway.read()).toEqual({
      dispatchPaused: false,
      lastAuditAt: null,
      lastRegressionReason: null,
    });
  });

  it('records a regression reason on pause', () => {
    const gateway = new InMemoryBillingStateGateway();

    gateway.pause('api pool detected', '2026-05-22T10:00:00Z');

    expect(gateway.read()).toEqual({
      dispatchPaused: true,
      lastAuditAt: '2026-05-22T10:00:00Z',
      lastRegressionReason: 'api pool detected',
    });
  });

  it('clears the regression reason on resume', () => {
    const gateway = new InMemoryBillingStateGateway();

    gateway.pause('reason', '2026-05-22T10:00:00Z');
    gateway.resume('2026-05-22T10:01:00Z');

    expect(gateway.read()).toEqual({
      dispatchPaused: false,
      lastAuditAt: '2026-05-22T10:01:00Z',
      lastRegressionReason: null,
    });
  });

  it('records a healthy audit without flipping the paused flag', () => {
    const gateway = new InMemoryBillingStateGateway();
    gateway.pause('reason', '2026-05-22T10:00:00Z');

    gateway.recordHealthy('2026-05-22T11:00:00Z');

    expect(gateway.read().dispatchPaused).toBe(true);
    expect(gateway.read().lastAuditAt).toBe('2026-05-22T11:00:00Z');
    expect(gateway.read().lastRegressionReason).toBe(null);
  });
});
