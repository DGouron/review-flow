import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { FilesystemTokenUsageGateway } from '@/modules/token-accounting/interface-adapters/gateways/tokenUsage/tokenUsage.filesystem.gateway.js';
import { TokenUsageRecordFactory } from '@/tests/factories/tokenUsage.factory.js';

describe('FilesystemTokenUsageGateway', () => {
  let tempDir: string;
  let gateway: FilesystemTokenUsageGateway;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reviewflow-test-'));
    gateway = new FilesystemTokenUsageGateway();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should record and load a single record (roundtrip)', async () => {
    const record = TokenUsageRecordFactory.create({ localPath: tempDir });

    await gateway.record(record);
    const loaded = await gateway.loadAll(tempDir);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(record);
  });

  it('should record multiple records and load all', async () => {
    const record1 = TokenUsageRecordFactory.create({ jobId: 'job-1', localPath: tempDir });
    const record2 = TokenUsageRecordFactory.create({ jobId: 'job-2', localPath: tempDir });
    const record3 = TokenUsageRecordFactory.create({ jobId: 'job-3', localPath: tempDir });

    await gateway.record(record1);
    await gateway.record(record2);
    await gateway.record(record3);

    const loaded = await gateway.loadAll(tempDir);
    expect(loaded).toHaveLength(3);
  });

  it('should return empty array when file does not exist', async () => {
    const loaded = await gateway.loadAll(tempDir);
    expect(loaded).toEqual([]);
  });

  it('should silently skip invalid lines in file', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const dir = join(tempDir, '.claude', 'reviews');
    mkdirSync(dir, { recursive: true });
    const validRecord = TokenUsageRecordFactory.create({ localPath: tempDir });
    const invalidLine = 'not valid json';
    const validLine = JSON.stringify(validRecord);
    writeFileSync(join(dir, 'usage.jsonl'), `${invalidLine}\n${validLine}\n`);

    const loaded = await gateway.loadAll(tempDir);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(validRecord);
  });

  it('should create directory if it does not exist', async () => {
    const record = TokenUsageRecordFactory.create({ localPath: tempDir });

    await expect(gateway.record(record)).resolves.not.toThrow();

    const loaded = await gateway.loadAll(tempDir);
    expect(loaded).toHaveLength(1);
  });
});
