import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import { nudgeAuthorsRoutes } from '@/modules/tracking/interface-adapters/controllers/http/nudgeAuthors.routes.js';
import { NudgeAuthorsUseCase } from '@/modules/tracking/usecases/tracking/nudgeAuthors.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const LOCAL_PATH = '/repo/app';

async function buildApp(): Promise<{
  app: FastifyInstance;
  postGateway: StubNoteCommentPostGateway;
}> {
  const tracking = new InMemoryReviewRequestTrackingGateway();
  tracking.create(
    LOCAL_PATH,
    TrackedMrFactory.create({
      id: 'github-org/app-5',
      mrNumber: 5,
      project: 'org/app',
      platform: 'github',
    }),
  );
  const postGateway = new StubNoteCommentPostGateway();
  const app = Fastify();
  await app.register(nudgeAuthorsRoutes, {
    nudgeAuthors: new NudgeAuthorsUseCase(tracking, () => postGateway),
    logger: createStubLogger(),
  });
  return { app, postGateway };
}

describe('POST /api/mr-tracking/nudge', () => {
  it('posts a reminder on every requested merge request and returns what was nudged', async () => {
    const { app, postGateway } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/nudge',
      payload: { projectPath: LOCAL_PATH, mrIds: ['github-org/app-5'], language: 'fr' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, nudged: [5], failed: [] });
    expect(postGateway.calls).toHaveLength(1);
  });

  it('rejects a request without merge request identifiers', async () => {
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/nudge',
      payload: { projectPath: LOCAL_PATH, mrIds: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a relative project path', async () => {
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/nudge',
      payload: { projectPath: 'repo/../app', mrIds: ['github-org/app-5'] },
    });

    expect(response.statusCode).toBe(400);
  });
});
