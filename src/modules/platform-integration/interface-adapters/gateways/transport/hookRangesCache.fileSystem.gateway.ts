import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { safeParseHookRangesSnapshot } from '@/modules/platform-integration/entities/transport/githubHookRanges.guard.js';
import type { HookRangesSnapshot } from '@/modules/platform-integration/entities/transport/githubHookRanges.schema.js';
import type { HookRangesCacheGateway } from '@/modules/platform-integration/entities/transport/hookRangesCache.gateway.js';

export interface HookRangesCacheFileSystemGatewayOptions {
  cacheFilePath: string;
}

export class HookRangesCacheFileSystemGateway implements HookRangesCacheGateway {
  private readonly cacheFilePath: string;

  constructor(options: HookRangesCacheFileSystemGatewayOptions) {
    this.cacheFilePath = options.cacheFilePath;
  }

  async load(): Promise<HookRangesSnapshot | null> {
    try {
      const content = await readFile(this.cacheFilePath, 'utf-8');
      const parsed = safeParseHookRangesSnapshot(JSON.parse(content));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async save(snapshot: HookRangesSnapshot): Promise<void> {
    await mkdir(dirname(this.cacheFilePath), { recursive: true });
    await writeFile(this.cacheFilePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
  }
}
