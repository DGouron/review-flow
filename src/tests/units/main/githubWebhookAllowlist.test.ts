import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import { startGitHubWebhookAllowlist } from '@/main/githubWebhookAllowlist.js';
import { HookRangesSnapshotFactory } from '@/tests/factories/hookRangesSnapshot.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';

const MODE_KEY = 'WEBHOOK_ALLOWLIST_MODE';
const CIDR_KEY = 'WEBHOOK_ALLOWED_CIDR_RANGES';

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
    const fetchFunction = async () =>
      new Response(JSON.stringify({ hooks: ['9.234.106.48/28'] }), { status: 200 });

    const allowlist = await startGitHubWebhookAllowlist(createCapturingLogger().logger, {
      fetchFunction,
    });
    allowlist.stop();

    expect(allowlist.currentRanges()).toEqual(['9.234.106.48/28', '10.0.0.0/8']);
    expect(JSON.parse(readFileSync(cacheFilePath, 'utf-8')).ranges).toEqual(['9.234.106.48/28']);
  });

  it('starts offline from the cache file in the config directory', async () => {
    mkdirSync(join(configHome, 'reviewflow'), { recursive: true });
    writeFileSync(
      cacheFilePath,
      JSON.stringify(HookRangesSnapshotFactory.create({ ranges: ['192.30.252.0/22'] })),
    );
    const fetchFunction = async (): Promise<Response> => {
      throw new Error('getaddrinfo ENOTFOUND api.github.com');
    };

    const allowlist = await startGitHubWebhookAllowlist(createCapturingLogger().logger, {
      fetchFunction,
    });
    allowlist.stop();

    expect(allowlist.currentRanges()).toEqual(['192.30.252.0/22', '10.0.0.0/8']);
  });
});
