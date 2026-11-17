import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDependencies } from '@/main/dependencies.js';
import { buildServer } from '@/main/server.js';
import { createTestConfig } from '@/tests/factories/config.factory.js';

const TRUSTED_HOP = '127.0.0.1';
const GITHUB_SENDER = '9.234.106.50';
const TRANSPORT_GUARD_REJECTION = 403;
const UNSIGNED_WEBHOOK_REJECTION = 401;

describe('POST /webhooks/github allowlist wiring', () => {
  let server: FastifyInstance;
  let githubRanges: string[] = [];

  beforeAll(async () => {
    vi.stubEnv('WEBHOOK_TRUSTED_HOP', TRUSTED_HOP);
    const dependencies = createDependencies(createTestConfig());
    dependencies.githubWebhookAllowedCidrRanges = () => githubRanges;
    server = await buildServer(dependencies);
  });

  afterAll(async () => {
    await server.close();
    vi.unstubAllEnvs();
  });

  function deliverFromGitHub(senderAddress: string) {
    return server.inject({
      method: 'POST',
      url: '/webhooks/github',
      remoteAddress: TRUSTED_HOP,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': senderAddress,
        'x-github-event': 'ping',
      },
      payload: '{}',
    });
  }

  it('reads the current GitHub ranges on every request, not once at startup', async () => {
    githubRanges = ['192.30.252.0/22'];
    const beforeRefresh = await deliverFromGitHub(GITHUB_SENDER);

    githubRanges = ['192.30.252.0/22', '9.234.106.48/28'];
    const afterRefresh = await deliverFromGitHub(GITHUB_SENDER);

    expect(beforeRefresh.statusCode).toBe(TRANSPORT_GUARD_REJECTION);
    expect(afterRefresh.statusCode).toBe(UNSIGNED_WEBHOOK_REJECTION);
  });

  it('lets an ipv4-mapped GitHub sender through the guard', async () => {
    githubRanges = ['9.234.106.48/28'];

    const response = await deliverFromGitHub(`::ffff:${GITHUB_SENDER}`);

    expect(response.statusCode).toBe(UNSIGNED_WEBHOOK_REJECTION);
  });
});
