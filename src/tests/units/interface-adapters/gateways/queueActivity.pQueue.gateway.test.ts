import { describe, it, expect } from 'vitest';

import { QueueActivityPQueueGateway } from '@/modules/cli-configuration/interface-adapters/gateways/queueActivity.pQueue.gateway.js';

describe('QueueActivityPQueueGateway', () => {
  it('sums queued and running jobs from the queue stats', () => {
    const gateway = new QueueActivityPQueueGateway(() => ({ size: 3, pending: 2, recentJobs: 5 }));

    expect(gateway.countActiveOrWaiting()).toBe(5);
  });

  it('returns zero when the queue is empty', () => {
    const gateway = new QueueActivityPQueueGateway(() => ({ size: 0, pending: 0, recentJobs: 0 }));

    expect(gateway.countActiveOrWaiting()).toBe(0);
  });

  it('falls back to the real queue stats reader when none is injected', () => {
    const gateway = new QueueActivityPQueueGateway();

    expect(gateway.countActiveOrWaiting()).toBe(0);
  });
});
