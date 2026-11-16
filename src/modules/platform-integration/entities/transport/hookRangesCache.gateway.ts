import type { HookRangesSnapshot } from '@/modules/platform-integration/entities/transport/githubHookRanges.schema.js';

/** Last known GitHub hook ranges, kept so the allowlist survives an offline start. */
export interface HookRangesCacheGateway {
  load(): Promise<HookRangesSnapshot | null>;
  save(snapshot: HookRangesSnapshot): Promise<void>;
}
