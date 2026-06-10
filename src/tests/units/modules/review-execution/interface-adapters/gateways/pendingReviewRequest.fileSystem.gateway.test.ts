import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { PendingReviewRequestFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/pendingReviewRequest.fileSystem.gateway.js';
import { PendingReviewRequestFactory } from '@/tests/factories/pendingReviewRequest.factory.js';

describe('PendingReviewRequestFileSystemGateway', () => {
  let rootDir: string;
  let gateway: PendingReviewRequestFileSystemGateway;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-pending-fs-'));
    gateway = new PendingReviewRequestFileSystemGateway({ rootDir });
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('saves then loads a pending request', async () => {
    const pending = PendingReviewRequestFactory.create();

    await gateway.save(pending);
    const loaded = await gateway.load(pending.pendingReviewRequestId);

    expect(loaded).not.toBeNull();
    expect(loaded?.pendingReviewRequestId).toBe(pending.pendingReviewRequestId);
    expect(loaded?.job.id).toBe(pending.job.id);
  });

  it('returns null when the id does not exist', async () => {
    const result = await gateway.load('missing-id');

    expect(result).toBeNull();
  });

  it('lists every persisted pending request', async () => {
    await gateway.save(PendingReviewRequestFactory.create({ pendingReviewRequestId: 'pending-1' }));
    await gateway.save(PendingReviewRequestFactory.create({ pendingReviewRequestId: 'pending-2' }));

    const result = await gateway.listAll();

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.pendingReviewRequestId).toSorted()).toEqual([
      'pending-1',
      'pending-2',
    ]);
  });

  it('skips malformed JSON files when listing', async () => {
    writeFileSync(join(rootDir, 'broken.json'), 'not json');
    await gateway.save(PendingReviewRequestFactory.create({ pendingReviewRequestId: 'pending-1' }));

    const result = await gateway.listAll();

    expect(result).toHaveLength(1);
    expect(result[0].pendingReviewRequestId).toBe('pending-1');
  });

  it('deletes the pending file and returns true when present', async () => {
    const pending = PendingReviewRequestFactory.create();
    await gateway.save(pending);

    const removed = await gateway.delete(pending.pendingReviewRequestId);

    expect(removed).toBe(true);
    expect(await gateway.load(pending.pendingReviewRequestId)).toBeNull();
  });

  it('returns false when deleting an unknown id', async () => {
    const removed = await gateway.delete('missing-id');

    expect(removed).toBe(false);
  });

  it('persists pending entries across instances (process restart simulation)', async () => {
    const pending = PendingReviewRequestFactory.create();
    await gateway.save(pending);

    const freshInstance = new PendingReviewRequestFileSystemGateway({ rootDir });
    const restored = await freshInstance.listAll();

    expect(restored).toHaveLength(1);
    expect(restored[0].pendingReviewRequestId).toBe(pending.pendingReviewRequestId);
    expect(existsSync(join(rootDir, 'pending-gitlab-group-project-42.json'))).toBe(true);
  });
});
