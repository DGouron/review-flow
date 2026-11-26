import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ReviewBriefCacheKey } from '@/modules/review-brief/entities/reviewBrief/reviewBriefCache.gateway.js';
import { ReviewBriefCacheFileSystemGateway } from '@/modules/review-brief/interface-adapters/gateways/reviewBriefCache.fileSystem.gateway.js';
import { ReviewBriefFactory } from '@/tests/factories/reviewBrief.factory.js';

function cacheKey(overrides: Partial<ReviewBriefCacheKey> = {}): ReviewBriefCacheKey {
  return {
    localPath: '/repos/sample-project',
    platform: 'github',
    mrNumber: 42,
    headSha: 'aaa111',
    language: 'en',
    ...overrides,
  };
}

function cachedFiles(homeDir: string): string[] {
  return readdirSync(join(homeDir, '.claude-review', 'review-briefs'), {
    recursive: true,
    encoding: 'utf-8',
  }).filter((name) => name.endsWith('.json'));
}

describe('ReviewBriefCacheFileSystemGateway', () => {
  let homeDir: string;
  let gateway: ReviewBriefCacheFileSystemGateway;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'review-brief-cache-'));
    gateway = new ReviewBriefCacheFileSystemGateway({ homeDir });
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('returns null when nothing was cached', async () => {
    expect(await gateway.load(cacheKey())).toBeNull();
  });

  it('returns the brief it saved for the same key', async () => {
    const brief = ReviewBriefFactory.create();

    await gateway.save(cacheKey(), brief);

    expect(await gateway.load(cacheKey())).toEqual(brief);
  });

  it.each([
    ['head sha', { headSha: 'bbb222' }],
    ['language', { language: 'fr' }],
    ['platform', { platform: 'gitlab' }],
    ['request number', { mrNumber: 43 }],
    ['project', { localPath: '/repos/other-project' }],
  ] satisfies Array<[string, Partial<ReviewBriefCacheKey>]>)(
    'misses when the %s differs',
    async (_label, difference) => {
      await gateway.save(cacheKey(), ReviewBriefFactory.create());

      expect(await gateway.load(cacheKey(difference))).toBeNull();
    },
  );

  it('keeps two project paths that only differ by a slash or an underscore in two folders', async () => {
    await gateway.save(cacheKey({ localPath: '/a_b' }), ReviewBriefFactory.create({ what: 'A_B' }));
    await gateway.save(cacheKey({ localPath: '/a/b' }), ReviewBriefFactory.create({ what: 'A/B' }));

    expect(readdirSync(join(homeDir, '.claude-review', 'review-briefs'))).toHaveLength(2);
    expect((await gateway.load(cacheKey({ localPath: '/a_b' })))?.what).toBe('A_B');
    expect((await gateway.load(cacheKey({ localPath: '/a/b' })))?.what).toBe('A/B');
  });

  it('replaces the brief saved for the same key', async () => {
    await gateway.save(cacheKey(), ReviewBriefFactory.create({ what: 'First' }));
    await gateway.save(cacheKey(), ReviewBriefFactory.create({ what: 'Second' }));

    expect((await gateway.load(cacheKey()))?.what).toBe('Second');
    expect(cachedFiles(homeDir)).toHaveLength(1);
  });

  it('stores briefs under the review-flow home directory, never inside the reviewed repository', async () => {
    const repositoryPath = join(homeDir, 'repository');

    await gateway.save(cacheKey({ localPath: repositoryPath }), ReviewBriefFactory.create());

    expect(cachedFiles(homeDir)).toHaveLength(1);
    expect(existsSync(repositoryPath)).toBe(false);
  });

  it('keeps a hostile head sha inside the cache directory', async () => {
    await gateway.save(cacheKey({ headSha: '../../escape' }), ReviewBriefFactory.create());

    expect(cachedFiles(homeDir)).toHaveLength(1);
    expect(readdirSync(homeDir)).toEqual(['.claude-review']);
  });

  it('treats a corrupted cache file as a miss', async () => {
    await gateway.save(cacheKey(), ReviewBriefFactory.create());
    const [file] = cachedFiles(homeDir);
    writeFileSync(join(homeDir, '.claude-review', 'review-briefs', file), '{not json', 'utf-8');

    expect(await gateway.load(cacheKey())).toBeNull();
  });

  it('treats a cache file that breaks the brief schema as a miss', async () => {
    await gateway.save(cacheKey(), ReviewBriefFactory.create());
    const [file] = cachedFiles(homeDir);
    writeFileSync(
      join(homeDir, '.claude-review', 'review-briefs', file),
      JSON.stringify({ what: 'only a part' }),
      'utf-8',
    );

    expect(await gateway.load(cacheKey())).toBeNull();
  });
});
