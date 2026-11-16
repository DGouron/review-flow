import { join } from 'node:path';

import type { Logger } from 'pino';

import {
  startGitHubWebhookAllowlistScheduler,
  type GitHubWebhookAllowlistScheduler,
} from '@/frameworks/scheduler/githubWebhookAllowlistScheduler.js';
import { GitHubHookRangesHttpGateway } from '@/modules/platform-integration/interface-adapters/gateways/transport/githubHookRanges.http.gateway.js';
import { HookRangesCacheFileSystemGateway } from '@/modules/platform-integration/interface-adapters/gateways/transport/hookRangesCache.fileSystem.gateway.js';
import { RefreshGitHubWebhookAllowlistUseCase } from '@/modules/platform-integration/usecases/transport/refreshGitHubWebhookAllowlist.usecase.js';
import { resolveAllowedCidrRanges, resolveAllowlistMode } from '@/security/transportGuardConfig.js';
import { getConfigDir } from '@/shared/services/configDir.js';

const TWENTY_FOUR_HOURS_IN_MILLISECONDS = 86_400_000;
const HOOK_RANGES_CACHE_FILE_NAME = 'github-hook-ranges.json';

export async function startGitHubWebhookAllowlist(
  logger: Logger,
): Promise<GitHubWebhookAllowlistScheduler> {
  const manualRanges = resolveAllowedCidrRanges();

  if (resolveAllowlistMode() === 'manual') {
    logger.info(
      { manualRangeCount: manualRanges.length },
      'GitHub webhook allowlist in manual mode: only WEBHOOK_ALLOWED_CIDR_RANGES is used',
    );
    return { currentRanges: () => manualRanges, stop: () => {} };
  }

  const refreshAllowlist = new RefreshGitHubWebhookAllowlistUseCase({
    hookRangesGateway: new GitHubHookRangesHttpGateway(),
    hookRangesCacheGateway: new HookRangesCacheFileSystemGateway({
      cacheFilePath: join(getConfigDir(), HOOK_RANGES_CACHE_FILE_NAME),
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
