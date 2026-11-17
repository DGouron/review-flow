import type { Logger } from 'pino';

import type { TransportRejectReason } from '@/modules/platform-integration/entities/transport/transportContext.js';

const WINDOW_IN_MILLISECONDS = 60_000;
const MAXIMUM_ADDRESSES_PER_REASON_PER_WINDOW = 32;
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

type ReasonWindow = { startedAt: number; loggedAddresses: Set<string>; suppressedCount: number };

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
 * Logs transport guard rejections with bounded fields. Each source address is
 * logged once per reason per minute, for at most 32 addresses, so a noisy client
 * cannot fill the disk nor hide the first refusal of another address.
 */
export class TransportRejectionLog {
  private readonly windows = new Map<TransportRejectReason, ReasonWindow>();

  constructor(private readonly dependencies: TransportRejectionLogDependencies) {}

  record(rejection: TransportRejection): void {
    const current = this.windows.get(rejection.reason);
    const window = this.windowAt(this.dependencies.now(), current);
    this.windows.set(rejection.reason, window);

    const sourceAddress = (rejection.clientIp ?? rejection.socketAddress).slice(
      0,
      MAXIMUM_LOGGED_ADDRESS_LENGTH,
    );
    if (
      window.loggedAddresses.has(sourceAddress) ||
      window.loggedAddresses.size >= MAXIMUM_ADDRESSES_PER_REASON_PER_WINDOW
    ) {
      window.suppressedCount += 1;
      return;
    }
    window.loggedAddresses.add(sourceAddress);

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

  private windowAt(now: number, current: ReasonWindow | undefined): ReasonWindow {
    return current === undefined || now - current.startedAt >= WINDOW_IN_MILLISECONDS
      ? { startedAt: now, loggedAddresses: new Set<string>(), suppressedCount: 0 }
      : current;
  }
}
