import type { BillingStateGateway } from '@/modules/claude-invocation/entities/billingState/billingState.gateway.js';

export interface AuditBillingDependencies {
  billingStateGateway: BillingStateGateway;
  now: () => Date;
}

export type AuditBillingResult = { regression: false } | { regression: true; reason: string };

// Heuristic-based API-pool detection was removed: `claude usage` output
// naturally contains both "API" and "token" on a healthy OAuth subscription,
// triggering systematic false positives that paused every dispatch.
// The remaining billing safeguard is `hasAnthropicApiKey()` in
// dispatchClaudeSession.usecase.ts — dispatch is rejected when an explicit
// ANTHROPIC_API_KEY env var is detected.
export async function auditBilling(deps: AuditBillingDependencies): Promise<AuditBillingResult> {
  const auditedAt = deps.now().toISOString();
  deps.billingStateGateway.recordHealthy(auditedAt);
  return { regression: false };
}
