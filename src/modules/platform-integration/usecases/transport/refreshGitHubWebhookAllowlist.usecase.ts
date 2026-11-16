import type { Logger } from 'pino';

import type { GitHubHookRangesGateway } from '@/modules/platform-integration/entities/transport/githubHookRanges.gateway.js';
import type { HookRangesCacheGateway } from '@/modules/platform-integration/entities/transport/hookRangesCache.gateway.js';
import {
  mergeCidrRanges,
  type WebhookAllowlistResolution,
  type WebhookAllowlistSource,
} from '@/modules/platform-integration/entities/transport/webhookAllowlist.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface RefreshGitHubWebhookAllowlistDependencies {
  hookRangesGateway: GitHubHookRangesGateway;
  hookRangesCacheGateway: HookRangesCacheGateway;
  manualRanges: string[];
  logger: Logger;
  now: () => Date;
}

/**
 * Resolves the GitHub webhook allowlist: GitHub meta `hooks` ranges, else the
 * last cached ones, else nothing — always merged with the manual ranges.
 * Degraded states are logged once when entered, not on every refresh.
 */
export class RefreshGitHubWebhookAllowlistUseCase implements UseCase<
  void,
  Promise<WebhookAllowlistResolution>
> {
  private lastSource: WebhookAllowlistSource | null = null;

  constructor(private readonly dependencies: RefreshGitHubWebhookAllowlistDependencies) {}

  async execute(): Promise<WebhookAllowlistResolution> {
    const fetchResult = await this.dependencies.hookRangesGateway.fetchHookRanges();
    const resolution =
      fetchResult.kind === 'fetched'
        ? await this.useFreshRanges(fetchResult.ranges)
        : await this.fallBack(fetchResult.reason);
    this.lastSource = resolution.source;
    return resolution;
  }

  private async useFreshRanges(ranges: string[]): Promise<WebhookAllowlistResolution> {
    const { hookRangesCacheGateway, manualRanges, logger, now } = this.dependencies;
    try {
      await hookRangesCacheGateway.save({ ranges, fetchedAt: now().toISOString() });
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Could not write the GitHub hook ranges cache',
      );
    }
    logger.info(
      { githubRangeCount: ranges.length, manualRangeCount: manualRanges.length },
      'GitHub webhook allowlist refreshed from GitHub meta',
    );
    return { source: 'github-meta', allowedCidrRanges: mergeCidrRanges(ranges, manualRanges) };
  }

  private async fallBack(reason: string): Promise<WebhookAllowlistResolution> {
    const { hookRangesCacheGateway, manualRanges, logger } = this.dependencies;
    const cached = await hookRangesCacheGateway.load();

    if (cached !== null) {
      if (this.lastSource !== 'cache') {
        logger.warn(
          { reason, cachedAt: cached.fetchedAt, githubRangeCount: cached.ranges.length },
          'GitHub meta unreachable: GitHub webhook allowlist uses the cached hook ranges',
        );
      }
      return { source: 'cache', allowedCidrRanges: mergeCidrRanges(cached.ranges, manualRanges) };
    }

    if (this.lastSource !== 'manual-only') {
      logger.error(
        { reason, manualRangeCount: manualRanges.length },
        'GitHub meta unreachable and no cache: GitHub webhook allowlist falls back to WEBHOOK_ALLOWED_CIDR_RANGES only, GitHub webhooks from unlisted ranges will be rejected',
      );
    }
    return { source: 'manual-only', allowedCidrRanges: manualRanges };
  }
}
