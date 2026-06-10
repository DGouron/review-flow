import type { Logger } from 'pino';

import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';

export function fetchDiffStatsSafely(
  gateway: DiffStatsFetchGateway,
  projectPath: string,
  mergeRequestNumber: number,
  logger: Logger,
): DiffStats | null {
  try {
    return gateway.fetchDiffStats(projectPath, mergeRequestNumber);
  } catch (error) {
    logger.warn({ projectPath, mergeRequestNumber, error }, 'Failed to fetch diff stats');
    return null;
  }
}
