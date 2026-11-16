import type { Logger } from 'pino';

import type { WebhookAllowlistResolution } from '@/modules/platform-integration/entities/transport/webhookAllowlist.js';

export interface GitHubWebhookAllowlistSchedulerDependencies {
  refreshAllowlist: { execute(): Promise<WebhookAllowlistResolution> };
  initialRanges: string[];
  intervalMs: number;
  logger: Logger;
}

export interface GitHubWebhookAllowlistScheduler {
  currentRanges: () => string[];
  stop: () => void;
}

export async function startGitHubWebhookAllowlistScheduler(
  dependencies: GitHubWebhookAllowlistSchedulerDependencies,
): Promise<GitHubWebhookAllowlistScheduler> {
  const { refreshAllowlist, intervalMs, logger } = dependencies;
  let allowedCidrRanges = dependencies.initialRanges;

  async function refresh(): Promise<void> {
    try {
      const resolution = await refreshAllowlist.execute();
      allowedCidrRanges = resolution.allowedCidrRanges;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'GitHub webhook allowlist refresh failed; keeping the previous allowlist',
      );
    }
  }

  await refresh();
  const intervalId = setInterval(refresh, intervalMs);

  return {
    currentRanges: () => allowedCidrRanges,
    stop: () => clearInterval(intervalId),
  };
}
