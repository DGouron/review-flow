import { describe, it, expect } from 'vitest';

import { startGitHubWebhookAllowlistScheduler } from '@/frameworks/scheduler/githubWebhookAllowlistScheduler.js';
import { transportGuardMiddleware } from '@/modules/platform-integration/interface-adapters/controllers/webhook/transportGuard.middleware.js';
import { ForwardedForClientIpResolver } from '@/modules/platform-integration/interface-adapters/gateways/transport/clientIpResolver.forwardedFor.gateway.js';
import { RefreshGitHubWebhookAllowlistUseCase } from '@/modules/platform-integration/usecases/transport/refreshGitHubWebhookAllowlist.usecase.js';
import { HookRangesSnapshotFactory } from '@/tests/factories/hookRangesSnapshot.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubGitHubHookRangesGateway } from '@/tests/stubs/githubHookRanges.stub.js';
import { StubHookRangesCacheGateway } from '@/tests/stubs/hookRangesCache.stub.js';

const TRUSTED_HOP = '127.0.0.1';
const STALE_MANUAL_RANGES = ['192.30.252.0/22', '140.82.112.0/20'];
const NEW_GITHUB_SENDER = '9.234.106.50';
const NEW_GITHUB_IPV6_SENDER = '2606:50c0:8000::154';

async function deliverGitHubWebhook(options: {
  hookRangesGateway: StubGitHubHookRangesGateway;
  hookRangesCacheGateway?: StubHookRangesCacheGateway;
  senderAddress: string;
}) {
  const capturing = createCapturingLogger();
  const scheduler = await startGitHubWebhookAllowlistScheduler({
    refreshAllowlist: new RefreshGitHubWebhookAllowlistUseCase({
      hookRangesGateway: options.hookRangesGateway,
      hookRangesCacheGateway: options.hookRangesCacheGateway ?? new StubHookRangesCacheGateway(),
      manualRanges: STALE_MANUAL_RANGES,
      logger: capturing.logger,
      now: () => new Date('2026-11-16T10:00:00.000Z'),
    }),
    initialRanges: STALE_MANUAL_RANGES,
    intervalMs: 86_400_000,
    logger: capturing.logger,
  });

  let accepted = false;
  let status: number | null = null;
  transportGuardMiddleware(
    {
      request: {
        socket: { remoteAddress: TRUSTED_HOP },
        headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': options.senderAddress },
      },
      reply: {
        code: (code: number) => {
          status = code;
        },
        send: () => {},
      },
      next: () => {
        accepted = true;
      },
      resolver: new ForwardedForClientIpResolver(),
      logger: capturing.logger,
    },
    { trustedHopAddress: TRUSTED_HOP, allowedCidrRanges: scheduler.currentRanges() },
  );
  scheduler.stop();

  return { accepted, status, capturing };
}

describe('GitHub webhook allowlist read from GitHub meta (acceptance)', () => {
  it('accepts a webhook from a newly published GitHub range missing from WEBHOOK_ALLOWED_CIDR_RANGES', async () => {
    const outcome = await deliverGitHubWebhook({
      hookRangesGateway: StubGitHubHookRangesGateway.returning(['9.234.106.48/28']),
      senderAddress: NEW_GITHUB_SENDER,
    });

    expect(outcome.accepted).toBe(true);
  });

  it('accepts a webhook from a GitHub ipv6 range', async () => {
    const outcome = await deliverGitHubWebhook({
      hookRangesGateway: StubGitHubHookRangesGateway.returning(['2606:50c0::/32']),
      senderAddress: NEW_GITHUB_IPV6_SENDER,
    });

    expect(outcome.accepted).toBe(true);
  });

  it('keeps accepting from the cached ranges when GitHub meta is unreachable', async () => {
    const outcome = await deliverGitHubWebhook({
      hookRangesGateway: StubGitHubHookRangesGateway.failing('getaddrinfo ENOTFOUND'),
      hookRangesCacheGateway: new StubHookRangesCacheGateway(HookRangesSnapshotFactory.create()),
      senderAddress: NEW_GITHUB_SENDER,
    });

    expect(outcome.accepted).toBe(true);
  });

  it('falls back to the variable alone without cache, and the refusal is visible in the logs', async () => {
    const outcome = await deliverGitHubWebhook({
      hookRangesGateway: StubGitHubHookRangesGateway.failing('getaddrinfo ENOTFOUND'),
      senderAddress: NEW_GITHUB_SENDER,
    });

    expect(outcome.accepted).toBe(false);
    expect(outcome.status).toBe(403);
    expect(outcome.capturing.errorMessages.join('\n')).toContain('WEBHOOK_ALLOWED_CIDR_RANGES');
    expect(outcome.capturing.warnMessages.join('\n')).toContain(NEW_GITHUB_SENDER);
    expect(outcome.capturing.warnMessages.join('\n')).toContain('off-allowlist');
  });
});
