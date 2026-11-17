import type { HookRangesSnapshot } from '@/modules/platform-integration/entities/transport/githubHookRanges.schema.js';
import type { HookRangesCacheGateway } from '@/modules/platform-integration/entities/transport/hookRangesCache.gateway.js';

export class StubHookRangesCacheGateway implements HookRangesCacheGateway {
  failOnSave = false;

  constructor(public stored: HookRangesSnapshot | null = null) {}

  async load(): Promise<HookRangesSnapshot | null> {
    return this.stored;
  }

  async save(snapshot: HookRangesSnapshot): Promise<void> {
    if (this.failOnSave) {
      throw new Error('disk full');
    }
    this.stored = snapshot;
  }
}
