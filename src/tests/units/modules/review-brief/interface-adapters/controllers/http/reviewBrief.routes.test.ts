import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import { reviewBriefRoutes } from '@/modules/review-brief/interface-adapters/controllers/http/reviewBrief.routes.js';
import { ExplainReviewRequestUseCase } from '@/modules/review-brief/usecases/explainReviewRequest/explainReviewRequest.usecase.js';
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';
import { ChangedFilesFactory } from '@/tests/factories/changedFiles.factory.js';
import { RepositoryConfigFactory } from '@/tests/factories/repositoryConfig.factory.js';
import { ReviewRequestOverviewFactory } from '@/tests/factories/reviewRequestOverview.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createCapturingLogger, type CapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';
import { StubChangedFilesFetchGateway } from '@/tests/stubs/changedFilesFetch.stub.js';
import { InMemoryReviewBriefCacheGateway } from '@/tests/stubs/reviewBriefCache.stub.js';
import { StubReviewBriefModelGateway } from '@/tests/stubs/reviewBriefModel.stub.js';
import { InMemoryReviewFileGateway } from '@/tests/stubs/reviewFile.stub.js';
import { StubReviewRequestOverviewFetchGateway } from '@/tests/stubs/reviewRequestOverview.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';
import { InMemoryThreadFetchGateway } from '@/tests/stubs/threadFetch.stub.js';

const PROJECT_PATH = '/repos/sample-project';
const MR_NUMBER = 42;

describe('reviewBriefRoutes — POST /api/mr-tracking/brief', () => {
  let model: StubReviewBriefModelGateway;
  let changedFiles: StubChangedFilesFetchGateway;
  let capturingLogger: CapturingLogger;
  let repositories: RepositoryConfig[];
  let language: Language;
  let app: FastifyInstance;

  beforeEach(async () => {
    const tracking = new InMemoryReviewRequestTrackingGateway();
    tracking.create(PROJECT_PATH, TrackedMrFactory.create({ mrNumber: MR_NUMBER }));
    const overview = new StubReviewRequestOverviewFetchGateway();
    overview.setOverview(MR_NUMBER, ReviewRequestOverviewFactory.create());
    changedFiles = new StubChangedFilesFetchGateway();
    changedFiles.setResponse(MR_NUMBER, ChangedFilesFactory.list([{ additions: 3, deletions: 1 }]));
    model = new StubReviewBriefModelGateway();
    capturingLogger = createCapturingLogger();
    repositories = [RepositoryConfigFactory.create({ localPath: PROJECT_PATH })];
    language = 'en';

    app = Fastify();
    await app.register(reviewBriefRoutes, {
      getRepositories: () => repositories,
      explainReviewRequest: new ExplainReviewRequestUseCase({
        trackingGateway: tracking,
        overviewFetchFor: () => overview,
        changedFilesFetchFor: () => changedFiles,
        threadFetchFor: () => new InMemoryThreadFetchGateway(),
        reviewFileGateway: new InMemoryReviewFileGateway(),
        modelGateway: model,
        cacheGateway: new InMemoryReviewBriefCacheGateway(),
        now: () => new Date('2026-11-26T10:00:00.000Z'),
      }),
      getLanguage: () => language,
      logger: capturingLogger.logger,
    });
  });

  async function post(payload: unknown) {
    return app.inject({
      method: 'POST',
      url: '/api/mr-tracking/brief',
      payload: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
    });
  }

  describe('400 on a malformed body', () => {
    it.each([
      ['mrNumber missing', { projectPath: PROJECT_PATH }],
      ['mrNumber as a string', { projectPath: PROJECT_PATH, mrNumber: '42' }],
      ['mrNumber negative', { projectPath: PROJECT_PATH, mrNumber: -1 }],
      ['mrNumber not an integer', { projectPath: PROJECT_PATH, mrNumber: 4.2 }],
      ['projectPath missing', { mrNumber: MR_NUMBER }],
      ['refresh not a boolean', { projectPath: PROJECT_PATH, mrNumber: MR_NUMBER, refresh: 'yes' }],
    ])('%s', async (_label, payload) => {
      const response = await post(payload);

      expect(response.statusCode).toBe(400);
      expect(typeof response.json().error).toBe('string');
      expect(model.requests).toHaveLength(0);
    });
  });

  describe('404', () => {
    it('when the project is not configured', async () => {
      const response = await post({ projectPath: '/repos/unknown', mrNumber: MR_NUMBER });

      expect(response.statusCode).toBe(404);
      expect(typeof response.json().error).toBe('string');
    });

    it('when the project is disabled', async () => {
      repositories = [RepositoryConfigFactory.create({ localPath: PROJECT_PATH, enabled: false })];

      const response = await post({ projectPath: PROJECT_PATH, mrNumber: MR_NUMBER });

      expect(response.statusCode).toBe(404);
      expect(model.requests).toHaveLength(0);
    });

    it('when the request is not tracked', async () => {
      const response = await post({ projectPath: PROJECT_PATH, mrNumber: 999 });

      expect(response.statusCode).toBe(404);
      expect(typeof response.json().error).toBe('string');
    });
  });

  describe('200', () => {
    it('returns the brief with exactly the contract keys', async () => {
      const response = await post({ projectPath: PROJECT_PATH, mrNumber: MR_NUMBER });

      expect(response.statusCode).toBe(200);
      expect(Object.keys(response.json()).toSorted()).toEqual([
        'areas',
        'generatedAt',
        'headSha',
        'mrNumber',
        'problem',
        'risks',
        'size',
        'toCheck',
        'what',
      ]);
      expect(response.json().size).toEqual({ additions: 3, deletions: 1, changedFiles: 1 });
    });

    it('writes the brief in the dashboard language', async () => {
      language = 'fr';

      await post({ projectPath: PROJECT_PATH, mrNumber: MR_NUMBER });

      expect(model.requests[0].systemPrompt).toContain('French');
    });

    it('regenerates the brief when refresh is true', async () => {
      await post({ projectPath: PROJECT_PATH, mrNumber: MR_NUMBER });
      await post({ projectPath: PROJECT_PATH, mrNumber: MR_NUMBER, refresh: true });

      expect(model.requests).toHaveLength(2);
    });

    it('serves the cached brief when refresh is absent', async () => {
      await post({ projectPath: PROJECT_PATH, mrNumber: MR_NUMBER });
      await post({ projectPath: PROJECT_PATH, mrNumber: MR_NUMBER });

      expect(model.requests).toHaveLength(1);
    });
  });

  describe('502', () => {
    it('when the brief could not be produced, logging the reason', async () => {
      model.failWith('review-brief-timeout');

      const response = await post({ projectPath: PROJECT_PATH, mrNumber: MR_NUMBER });

      expect(response.statusCode).toBe(502);
      expect(typeof response.json().error).toBe('string');
      expect(capturingLogger.warnMessages.join('\n')).toContain('review-brief-timeout');
    });

    it('when reading the material throws unexpectedly, logging the error', async () => {
      changedFiles.setFailure(MR_NUMBER);

      const response = await post({ projectPath: PROJECT_PATH, mrNumber: MR_NUMBER });

      expect(response.statusCode).toBe(502);
      expect(typeof response.json().error).toBe('string');
      expect(capturingLogger.errorMessages.join('\n')).toContain('API error for MR 42');
    });
  });
});
