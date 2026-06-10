import { describe, it, expect } from 'vitest';

import { auditBilling } from '@/modules/claude-invocation/usecases/auditBilling.usecase.js';
import { StubBillingStateGateway } from '@/tests/stubs/billingState.stub.js';

describe('auditBilling use case', () => {
  it('records audit time and never pauses (heuristic detection removed — only env var ANTHROPIC_API_KEY pauses dispatch, see dispatchClaudeSession.usecase.ts)', async () => {
    const billingStateGateway = new StubBillingStateGateway();

    const result = await auditBilling({
      billingStateGateway,
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    expect(result.regression).toBe(false);
    expect(billingStateGateway.read().dispatchPaused).toBe(false);
    expect(billingStateGateway.read().lastAuditAt).toBe('2026-05-22T10:00:00.000Z');
    expect(billingStateGateway.read().lastRegressionReason).toBeNull();
  });
});
