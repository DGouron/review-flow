import { describe, it, expect, afterEach } from 'vitest';

import { startGitHubWebhookAllowlist } from '@/main/githubWebhookAllowlist.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';

const MODE_KEY = 'WEBHOOK_ALLOWLIST_MODE';
const CIDR_KEY = 'WEBHOOK_ALLOWED_CIDR_RANGES';

describe('startGitHubWebhookAllowlist in manual mode', () => {
  const originalMode = process.env[MODE_KEY];
  const originalCidr = process.env[CIDR_KEY];

  afterEach(() => {
    if (originalMode === undefined) Reflect.deleteProperty(process.env, MODE_KEY);
    else process.env[MODE_KEY] = originalMode;
    if (originalCidr === undefined) Reflect.deleteProperty(process.env, CIDR_KEY);
    else process.env[CIDR_KEY] = originalCidr;
  });

  it('allows only the manual ranges and says so once', async () => {
    process.env[MODE_KEY] = 'manual';
    process.env[CIDR_KEY] = '10.0.0.0/8,192.30.252.0/22';
    const capturing = createCapturingLogger();

    const allowlist = await startGitHubWebhookAllowlist(capturing.logger);

    expect(allowlist.currentRanges()).toEqual(['10.0.0.0/8', '192.30.252.0/22']);
    expect(capturing.infoMessages.join('\n')).toContain('manual mode');
    allowlist.stop();
  });
});
