import { describe, it, expect } from 'vitest';

import { RefreshGitHubWebhookAllowlistUseCase } from '@/modules/platform-integration/usecases/transport/refreshGitHubWebhookAllowlist.usecase.js';
import {
  GITHUB_HOOK_RANGES_SAMPLE,
  HookRangesSnapshotFactory,
} from '@/tests/factories/hookRangesSnapshot.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubGitHubHookRangesGateway } from '@/tests/stubs/githubHookRanges.stub.js';
import { StubHookRangesCacheGateway } from '@/tests/stubs/hookRangesCache.stub.js';

const MANUAL_RANGES = ['10.0.0.0/8', '34.74.90.64/28'];
const NOW = new Date('2026-11-16T10:00:00.000Z');

function buildUseCase(options: {
  hookRangesGateway: StubGitHubHookRangesGateway;
  hookRangesCacheGateway?: StubHookRangesCacheGateway;
}) {
  const capturing = createCapturingLogger();
  const hookRangesCacheGateway = options.hookRangesCacheGateway ?? new StubHookRangesCacheGateway();
  const useCase = new RefreshGitHubWebhookAllowlistUseCase({
    hookRangesGateway: options.hookRangesGateway,
    hookRangesCacheGateway,
    manualRanges: MANUAL_RANGES,
    logger: capturing.logger,
    now: () => NOW,
  });
  return { useCase, capturing, hookRangesCacheGateway };
}

describe('RefreshGitHubWebhookAllowlistUseCase', () => {
  describe('when GitHub meta answers', () => {
    it('allows the meta hook ranges plus the manual ranges', async () => {
      const { useCase } = buildUseCase({
        hookRangesGateway: StubGitHubHookRangesGateway.returning(GITHUB_HOOK_RANGES_SAMPLE),
      });

      const resolution = await useCase.execute();

      expect(resolution.source).toBe('github-meta');
      expect(resolution.allowedCidrRanges).toEqual([
        ...GITHUB_HOOK_RANGES_SAMPLE,
        ...MANUAL_RANGES,
      ]);
    });

    it('does not duplicate a range present in both meta and the manual list', async () => {
      const { useCase } = buildUseCase({
        hookRangesGateway: StubGitHubHookRangesGateway.returning(['10.0.0.0/8', '192.30.252.0/22']),
      });

      const resolution = await useCase.execute();

      expect(resolution.allowedCidrRanges).toEqual([
        '10.0.0.0/8',
        '192.30.252.0/22',
        '34.74.90.64/28',
      ]);
    });

    it('stores the fresh ranges in the cache with the fetch time', async () => {
      const { useCase, hookRangesCacheGateway } = buildUseCase({
        hookRangesGateway: StubGitHubHookRangesGateway.returning(GITHUB_HOOK_RANGES_SAMPLE),
      });

      await useCase.execute();

      expect(hookRangesCacheGateway.stored).toEqual({
        ranges: GITHUB_HOOK_RANGES_SAMPLE,
        fetchedAt: NOW.toISOString(),
      });
    });

    it('still serves the fresh ranges when the cache cannot be written', async () => {
      const hookRangesCacheGateway = new StubHookRangesCacheGateway();
      hookRangesCacheGateway.failOnSave = true;
      const { useCase, capturing } = buildUseCase({
        hookRangesGateway: StubGitHubHookRangesGateway.returning(GITHUB_HOOK_RANGES_SAMPLE),
        hookRangesCacheGateway,
      });

      const resolution = await useCase.execute();

      expect(resolution.source).toBe('github-meta');
      expect(capturing.warnMessages.join('\n')).toContain('disk full');
    });
  });

  describe('when GitHub meta fails and a cache exists', () => {
    it('allows the cached ranges plus the manual ranges', async () => {
      const { useCase } = buildUseCase({
        hookRangesGateway: StubGitHubHookRangesGateway.failing('HTTP 503'),
        hookRangesCacheGateway: new StubHookRangesCacheGateway(
          HookRangesSnapshotFactory.create({ ranges: ['192.30.252.0/22'] }),
        ),
      });

      const resolution = await useCase.execute();

      expect(resolution.source).toBe('cache');
      expect(resolution.allowedCidrRanges).toEqual(['192.30.252.0/22', ...MANUAL_RANGES]);
    });

    it('warns with the failure reason and the cache age', async () => {
      const { useCase, capturing } = buildUseCase({
        hookRangesGateway: StubGitHubHookRangesGateway.failing('HTTP 503'),
        hookRangesCacheGateway: new StubHookRangesCacheGateway(HookRangesSnapshotFactory.create()),
      });

      await useCase.execute();

      expect(capturing.warnMessages).toHaveLength(1);
      expect(capturing.warnMessages[0]).toContain('HTTP 503');
      expect(capturing.warnMessages[0]).toContain('2026-11-09T08:00:00.000Z');
    });
  });

  describe('when GitHub meta fails and no cache exists', () => {
    it('falls back to the manual ranges only', async () => {
      const { useCase } = buildUseCase({
        hookRangesGateway: StubGitHubHookRangesGateway.failing('getaddrinfo ENOTFOUND'),
      });

      const resolution = await useCase.execute();

      expect(resolution.source).toBe('manual-only');
      expect(resolution.allowedCidrRanges).toEqual(MANUAL_RANGES);
    });

    it('logs the fallback once, clearly, even if the failure repeats', async () => {
      const { useCase, capturing } = buildUseCase({
        hookRangesGateway: StubGitHubHookRangesGateway.failing('getaddrinfo ENOTFOUND'),
      });

      await useCase.execute();
      await useCase.execute();
      await useCase.execute();

      expect(capturing.errorMessages).toHaveLength(1);
      expect(capturing.errorMessages[0]).toContain('WEBHOOK_ALLOWED_CIDR_RANGES');
      expect(capturing.errorMessages[0]).toContain('getaddrinfo ENOTFOUND');
    });

    it('logs the fallback again after GitHub meta recovered then failed', async () => {
      const hookRangesGateway = StubGitHubHookRangesGateway.failing('HTTP 500');
      const hookRangesCacheGateway = new StubHookRangesCacheGateway();
      const { useCase, capturing } = buildUseCase({ hookRangesGateway, hookRangesCacheGateway });

      await useCase.execute();
      hookRangesGateway.willReturn({ kind: 'fetched', ranges: GITHUB_HOOK_RANGES_SAMPLE });
      const recovered = await useCase.execute();
      hookRangesCacheGateway.stored = null;
      hookRangesGateway.willReturn({ kind: 'failed', reason: 'HTTP 500' });
      await useCase.execute();

      expect(recovered.source).toBe('github-meta');
      expect(capturing.errorMessages).toHaveLength(2);
    });
  });
});
