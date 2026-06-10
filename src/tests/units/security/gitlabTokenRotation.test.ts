import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { __resetGitlabTokenCacheForTests } from '@/security/gitlabWebhookTokenSource.js';
import { verifyGitLabSignature } from '@/security/verifier.js';
import { createFastifyRequestStub } from '@/tests/stubs/fastifyRequest.stub.js';

const ENV_KEY = 'GITLAB_WEBHOOK_TOKEN';

describe('verifyGitLabSignature token rotation (AC9)', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_KEY];
    __resetGitlabTokenCacheForTests();
  });

  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(process.env, ENV_KEY);
    } else {
      process.env[ENV_KEY] = original;
    }
    __resetGitlabTokenCacheForTests();
  });

  it('reads the current configured token, not a value captured at bootstrap', () => {
    process.env[ENV_KEY] = 'first-token-value';
    const firstRequest = createFastifyRequestStub({
      headers: { 'x-gitlab-token': 'first-token-value' },
    });
    expect(verifyGitLabSignature(firstRequest).valid).toBe(true);

    process.env[ENV_KEY] = 'rotated-token-value';

    const staleRequest = createFastifyRequestStub({
      headers: { 'x-gitlab-token': 'first-token-value' },
    });
    expect(verifyGitLabSignature(staleRequest).valid).toBe(false);

    const rotatedRequest = createFastifyRequestStub({
      headers: { 'x-gitlab-token': 'rotated-token-value' },
    });
    expect(verifyGitLabSignature(rotatedRequest).valid).toBe(true);
  });

  it('rejects a token of different length without a length-based short circuit', () => {
    process.env[ENV_KEY] = 'a-token-of-some-length';
    const shortRequest = createFastifyRequestStub({ headers: { 'x-gitlab-token': 'short' } });

    const result = verifyGitLabSignature(shortRequest);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('invalide');
  });
});
