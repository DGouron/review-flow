import type { Logger } from 'pino';

import type { TransportRejectReason } from '@/modules/platform-integration/entities/transport/transportContext.js';

const WINDOW_IN_MILLISECONDS = 60_000;
const MAXIMUM_LINES_PER_REASON_PER_WINDOW = 10;
const MAXIMUM_LOGGED_ADDRESS_LENGTH = 64;

export type TransportRejection = {
  reason: TransportRejectReason;
  clientIp: string | null;
  socketAddress: string;
};

export interface TransportRejectionLogDependencies {
  logger: Logger;
  now: () => number;
}

type ReasonWindow = { startedAt: number; loggedCount: number; suppressedCount: number };

function boundedAddressFields(field: string, address: string | null): Record<string, unknown> {
  if (address === null || address.length <= MAXIMUM_LOGGED_ADDRESS_LENGTH) {
    return { [field]: address };
  }
  return {
    [field]: address.slice(0, MAXIMUM_LOGGED_ADDRESS_LENGTH),
    [`${field}Length`]: address.length,
  };
}

/**
 * Logs transport guard rejections with bounded fields and at most
 * ten lines per reason per minute, so a noisy client cannot fill the disk.
 */
export class TransportRejectionLog {
  private readonly windows = new Map<TransportRejectReason, ReasonWindow>();

  constructor(private readonly dependencies: TransportRejectionLogDependencies) {}

  record(rejection: TransportRejection): void {
    const now = this.dependencies.now();
    const current = this.windows.get(rejection.reason);
    const window =
      current === undefined || now - current.startedAt >= WINDOW_IN_MILLISECONDS
        ? { startedAt: now, loggedCount: 0, suppressedCount: 0 }
        : current;
    this.windows.set(rejection.reason, window);

    if (window.loggedCount >= MAXIMUM_LINES_PER_REASON_PER_WINDOW) {
      window.suppressedCount += 1;
      return;
    }
    window.loggedCount += 1;

    const suppressedInPreviousWindow = window !== current ? (current?.suppressedCount ?? 0) : 0;
    this.dependencies.logger.warn(
      {
        reason: rejection.reason,
        ...boundedAddressFields('clientIp', rejection.clientIp),
        ...boundedAddressFields('socketAddress', rejection.socketAddress),
        ...(suppressedInPreviousWindow > 0 ? { suppressedInPreviousWindow } : {}),
      },
      'Webhook rejected by transport guard',
    );
  }
}
