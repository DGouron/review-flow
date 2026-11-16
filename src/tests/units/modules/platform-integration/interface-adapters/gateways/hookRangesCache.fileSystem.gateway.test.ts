import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { HookRangesCacheFileSystemGateway } from '@/modules/platform-integration/interface-adapters/gateways/transport/hookRangesCache.fileSystem.gateway.js';
import { HookRangesSnapshotFactory } from '@/tests/factories/hookRangesSnapshot.factory.js';

describe('HookRangesCacheFileSystemGateway', () => {
  let tempDir: string;
  let cacheFilePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reviewflow-hook-ranges-'));
    cacheFilePath = join(tempDir, 'nested', 'github-hook-ranges.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when no cache was ever written', async () => {
    const gateway = new HookRangesCacheFileSystemGateway({ cacheFilePath });

    expect(await gateway.load()).toBeNull();
  });

  it('loads back what it saved, creating the parent directory', async () => {
    const gateway = new HookRangesCacheFileSystemGateway({ cacheFilePath });
    const snapshot = HookRangesSnapshotFactory.create();

    await gateway.save(snapshot);

    expect(await gateway.load()).toEqual(snapshot);
    expect(JSON.parse(readFileSync(cacheFilePath, 'utf-8'))).toEqual(snapshot);
  });

  it('returns null when the cache file is not valid json', async () => {
    const gateway = new HookRangesCacheFileSystemGateway({ cacheFilePath });
    await gateway.save(HookRangesSnapshotFactory.create());
    writeFileSync(cacheFilePath, '{ truncated', 'utf-8');

    expect(await gateway.load()).toBeNull();
  });

  it('returns null when the cache file does not match the snapshot shape', async () => {
    const gateway = new HookRangesCacheFileSystemGateway({ cacheFilePath });
    await gateway.save(HookRangesSnapshotFactory.create());
    writeFileSync(cacheFilePath, JSON.stringify({ ranges: [] }), 'utf-8');

    expect(await gateway.load()).toBeNull();
  });
});
