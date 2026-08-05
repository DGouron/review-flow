import type { QueueActivityGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/queueActivity.gateway.js';

export class StubQueueActivity implements QueueActivityGateway {
  private readonly count: number;
  calls = 0;

  constructor(count = 0) {
    this.count = count;
  }

  countActiveOrWaiting(): number {
    this.calls += 1;
    return this.count;
  }
}
