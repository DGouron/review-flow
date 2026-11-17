import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Logger } from 'pino';

import { safeParseHookRangesSnapshot } from '@/modules/platform-integration/entities/transport/githubHookRanges.guard.js';
import type { HookRangesSnapshot } from '@/modules/platform-integration/entities/transport/githubHookRanges.schema.js';
import type { HookRangesCacheGateway } from '@/modules/platform-integration/entities/transport/hookRangesCache.gateway.js';

const OWNER_READ_WRITE_ONLY = 0o600;

export interface HookRangesCacheFileSystemGatewayOptions {
  cacheFilePath: string;
  logger: Logger;
}

function isFileMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export class HookRangesCacheFileSystemGateway implements HookRangesCacheGateway {
  private readonly cacheFilePath: string;
  private readonly logger: Logger;

  constructor(options: HookRangesCacheFileSystemGatewayOptions) {
    this.cacheFilePath = options.cacheFilePath;
    this.logger = options.logger;
  }

  async load(): Promise<HookRangesSnapshot | null> {
    try {
      const content = await readFile(this.cacheFilePath, 'utf-8');
      const parsed = safeParseHookRangesSnapshot(JSON.parse(content));
      if (!parsed.success) {
        this.warnUnusable(parsed.error.issues.map((issue) => issue.message).join('; '));
        return null;
      }
      return parsed.data;
    } catch (error) {
      if (!isFileMissing(error)) {
        this.warnUnusable(error instanceof Error ? error.message : String(error));
      }
      return null;
    }
  }

  async save(snapshot: HookRangesSnapshot): Promise<void> {
    await mkdir(dirname(this.cacheFilePath), { recursive: true });
    const temporaryFilePath = `${this.cacheFilePath}.${process.pid}.tmp`;
    await writeFile(temporaryFilePath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: 'utf-8',
      mode: OWNER_READ_WRITE_ONLY,
    });
    await rename(temporaryFilePath, this.cacheFilePath);
  }

  private warnUnusable(reason: string): void {
    this.logger.warn(
      { cacheFilePath: this.cacheFilePath, reason },
      'GitHub hook ranges cache ignored: the file exists but is not usable',
    );
  }
}
