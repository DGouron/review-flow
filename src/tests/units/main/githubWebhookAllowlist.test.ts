import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import { startGitHubWebhookAllowlist } from '@/main/githubWebhookAllowlist.js';
import { HookRangesSnapshotFactory } from '@/tests/factories/hookRangesSnapshot.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';

const MODE_KEY = 'WEBHOOK_ALLOWLIST_MODE';
const CIDR_KEY = 'WEBHOOK_ALLOWED_CIDR_RANGES';

async function answerWithHookRanges(): Promise<Response> {
  return new Response(JSON.stringify({ hooks: ['9.234.106.48/28'] }), { status: 200 });
}

async function failOffline(): Promise<Response> {
  throw new Error('getaddrinfo ENOTFOUND api.github.com');
}

describe('startGitHubWebhookAllowlist in manual mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows only the manual ranges and says so once', async () => {
    vi.stubEnv(MODE_KEY, 'manual');
    vi.stubEnv(CIDR_KEY, '10.0.0.0/8,192.30.252.0/22');
    const capturing = createCapturingLogger();

    const allowlist = await startGitHubWebhookAllowlist(capturing.logger);

    expect(allowlist.currentRanges()).toEqual(['10.0.0.0/8', '192.30.252.0/22']);
    expect(capturing.infoMessages.join('\n')).toContain('manual mode');
    expect(capturing.warnMessages).toEqual([]);
    allowlist.stop();
  });

  it('names the malformed manual ranges in one startup warning', async () => {
    vi.stubEnv(MODE_KEY, 'manual');
    vi.stubEnv(CIDR_KEY, '10.0.0.0/8,10.0.0.0/ 8,oops');
    const capturing = createCapturingLogger();

    const allowlist = await startGitHubWebhookAllowlist(capturing.logger);

    expect(capturing.warnMessages).toHaveLength(1);
    expect(capturing.warnMessages[0]).toContain('"malformedRanges":["10.0.0.0/ 8","oops"]');
    expect(capturing.warnMessages[0]).toContain('WEBHOOK_ALLOWED_CIDR_RANGES');
    allowlist.stop();
  });

  it('truncates an oversized malformed manual range in the startup warning', async () => {
    vi.stubEnv(MODE_KEY, 'manual');
    vi.stubEnv(CIDR_KEY, 'x'.repeat(5_000));
    const capturing = createCapturingLogger();

    const allowlist = await startGitHubWebhookAllowlist(capturing.logger);

    expect(capturing.warnMessages[0]).toContain(`"${'x'.repeat(64)}"`);
    expect(capturing.warnMessages[0].length).toBeLessThan(400);
    allowlist.stop();
  });
});

describe('startGitHubWebhookAllowlist in auto mode', () => {
  let configHome: string;
  let cacheFilePath: string;

  beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), 'reviewflow-allowlist-'));
    cacheFilePath = join(configHome, 'reviewflow', 'github-hook-ranges.json');
    vi.stubEnv('XDG_CONFIG_HOME', configHome);
    vi.stubEnv(MODE_KEY, '');
    vi.stubEnv(CIDR_KEY, '10.0.0.0/8');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(configHome, { recursive: true, force: true });
  });

  it('serves the GitHub meta ranges plus the manual ones and caches them in the config directory', async () => {
    const allowlist = await startGitHubWebhookAllowlist(createCapturingLogger().logger, {
      fetchFunction: answerWithHookRanges,
    });
    allowlist.stop();

    expect(allowlist.currentRanges()).toEqual(['9.234.106.48/28', '10.0.0.0/8']);
    expect(JSON.parse(readFileSync(cacheFilePath, 'utf-8')).ranges).toEqual(['9.234.106.48/28']);
  });

  it('names a malformed manual range in auto mode too', async () => {
    vi.stubEnv(CIDR_KEY, '10.0.0.0/8,oops');
    const capturing = createCapturingLogger();

    const allowlist = await startGitHubWebhookAllowlist(capturing.logger, {
      fetchFunction: answerWithHookRanges,
    });
    allowlist.stop();

    expect(capturing.warnMessages).toHaveLength(1);
    expect(capturing.warnMessages[0]).toContain('"malformedRanges":["oops"]');
  });

  it('starts offline from the cache file in the config directory', async () => {
    mkdirSync(join(configHome, 'reviewflow'), { recursive: true });
    writeFileSync(
      cacheFilePath,
      JSON.stringify(HookRangesSnapshotFactory.create({ ranges: ['192.30.252.0/22'] })),
    );
    const allowlist = await startGitHubWebhookAllowlist(createCapturingLogger().logger, {
      fetchFunction: failOffline,
    });
    allowlist.stop();

    expect(allowlist.currentRanges()).toEqual(['192.30.252.0/22', '10.0.0.0/8']);
  });
});
