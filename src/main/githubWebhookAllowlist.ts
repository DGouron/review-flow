import { join } from 'node:path';

import type { Logger } from 'pino';

import {
  startGitHubWebhookAllowlistScheduler,
  type GitHubWebhookAllowlistScheduler,
} from '@/frameworks/scheduler/githubWebhookAllowlistScheduler.js';
import { CidrRange } from '@/modules/platform-integration/entities/transport/cidrRange.valueObject.js';
import {
  GitHubHookRangesHttpGateway,
  type GitHubHookRangesHttpGatewayOptions,
} from '@/modules/platform-integration/interface-adapters/gateways/transport/hookRanges.github.http.gateway.js';
import { HookRangesCacheFileSystemGateway } from '@/modules/platform-integration/interface-adapters/gateways/transport/hookRangesCache.fileSystem.gateway.js';
import { RefreshGitHubWebhookAllowlistUseCase } from '@/modules/platform-integration/usecases/transport/refreshGitHubWebhookAllowlist.usecase.js';
import { resolveAllowedCidrRanges, resolveAllowlistMode } from '@/security/transportGuardConfig.js';
import { getConfigDir } from '@/shared/services/configDir.js';

const TWENTY_FOUR_HOURS_IN_MILLISECONDS = 86_400_000;
const HOOK_RANGES_CACHE_FILE_NAME = 'github-hook-ranges.json';
const MAXIMUM_REPORTED_RANGE_LENGTH = 64;

function warnAboutMalformedManualRanges(logger: Logger, manualRanges: string[]): void {
  const malformedRanges = manualRanges
    .filter((range) => CidrRange.parse(range) === null)
    .map((range) => range.slice(0, MAXIMUM_REPORTED_RANGE_LENGTH));
  if (malformedRanges.length > 0) {
    logger.warn(
      { malformedRanges },
      'Ignoring malformed WEBHOOK_ALLOWED_CIDR_RANGES entries: they match no address',
    );
  }
}

export async function startGitHubWebhookAllowlist(
  logger: Logger,
  httpOptions: GitHubHookRangesHttpGatewayOptions = {},
): Promise<GitHubWebhookAllowlistScheduler> {
  const manualRanges = resolveAllowedCidrRanges();
  warnAboutMalformedManualRanges(logger, manualRanges);

  if (resolveAllowlistMode() === 'manual') {
    logger.info(
      { manualRangeCount: manualRanges.length },
      'GitHub webhook allowlist in manual mode: only WEBHOOK_ALLOWED_CIDR_RANGES is used',
    );
    return { currentRanges: () => manualRanges, stop: () => {} };
  }

  const refreshAllowlist = new RefreshGitHubWebhookAllowlistUseCase({
    hookRangesGateway: new GitHubHookRangesHttpGateway(httpOptions),
    hookRangesCacheGateway: new HookRangesCacheFileSystemGateway({
      cacheFilePath: join(getConfigDir(), HOOK_RANGES_CACHE_FILE_NAME),
      logger,
    }),
    manualRanges,
    logger,
    now: () => new Date(),
  });

  return startGitHubWebhookAllowlistScheduler({
    refreshAllowlist,
    initialRanges: manualRanges,
    intervalMs: TWENTY_FOUR_HOURS_IN_MILLISECONDS,
    logger,
  });
}
