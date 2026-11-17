import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { HookRangesCacheFileSystemGateway } from '@/modules/platform-integration/interface-adapters/gateways/transport/hookRangesCache.fileSystem.gateway.js';
import { HookRangesSnapshotFactory } from '@/tests/factories/hookRangesSnapshot.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';

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

  function buildGateway() {
    const capturing = createCapturingLogger();
    const gateway = new HookRangesCacheFileSystemGateway({
      cacheFilePath,
      logger: capturing.logger,
    });
    return { gateway, capturing };
  }

  it('returns null without warning when no cache was ever written', async () => {
    const { gateway, capturing } = buildGateway();

    expect(await gateway.load()).toBeNull();
    expect(capturing.warnMessages).toEqual([]);
  });

  it('loads back what it saved, creating the parent directory', async () => {
    const { gateway } = buildGateway();
    const snapshot = HookRangesSnapshotFactory.create();

    await gateway.save(snapshot);

    expect(await gateway.load()).toEqual(snapshot);
    expect(JSON.parse(readFileSync(cacheFilePath, 'utf-8'))).toEqual(snapshot);
  });

  it('writes the cache readable by its owner only, through a temporary file it does not leave behind', async () => {
    const { gateway } = buildGateway();

    await gateway.save(HookRangesSnapshotFactory.create());
    await gateway.save(HookRangesSnapshotFactory.create({ fetchedAt: '2026-11-16T10:00:00.000Z' }));

    expect(statSync(cacheFilePath).mode & 0o777).toBe(0o600);
    expect(readdirSync(dirname(cacheFilePath))).toEqual(['github-hook-ranges.json']);
  });

  it('returns null and warns when the cache file is not valid json', async () => {
    const { gateway, capturing } = buildGateway();
    await gateway.save(HookRangesSnapshotFactory.create());
    writeFileSync(cacheFilePath, '{ truncated', 'utf-8');

    expect(await gateway.load()).toBeNull();
    expect(capturing.warnMessages).toHaveLength(1);
    expect(capturing.warnMessages[0]).toContain(cacheFilePath);
  });

  it('returns null when the cache file does not match the snapshot shape', async () => {
    const { gateway } = buildGateway();
    await gateway.save(HookRangesSnapshotFactory.create());
    writeFileSync(cacheFilePath, JSON.stringify({ ranges: [] }), 'utf-8');

    expect(await gateway.load()).toBeNull();
  });

  it('refuses and logs a cache holding a range that is too broad', async () => {
    const { gateway, capturing } = buildGateway();
    await gateway.save(HookRangesSnapshotFactory.create());
    writeFileSync(
      cacheFilePath,
      JSON.stringify(HookRangesSnapshotFactory.create({ ranges: ['0.0.0.0/0'] })),
      'utf-8',
    );

    expect(await gateway.load()).toBeNull();
    expect(capturing.warnMessages.join('\n')).toContain('too broad: \\"0.0.0.0/0\\"');
  });
});
