import { beforeEach, describe, expect, it } from 'vitest';

import {
  ExplainReviewRequestUseCase,
  type ExplainReviewRequestInput,
} from '@/modules/review-brief/usecases/explainReviewRequest/explainReviewRequest.usecase.js';
import type { Platform } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import { ChangedFilesFactory } from '@/tests/factories/changedFiles.factory.js';
import { ReviewBriefFactory } from '@/tests/factories/reviewBrief.factory.js';
import { ReviewContextFactory } from '@/tests/factories/reviewContext.factory.js';
import { ReviewRequestOverviewFactory } from '@/tests/factories/reviewRequestOverview.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { StubChangedFilesFetchGateway } from '@/tests/stubs/changedFilesFetch.stub.js';
import { InMemoryReviewBriefCacheGateway } from '@/tests/stubs/reviewBriefCache.stub.js';
import { StubReviewBriefModelGateway } from '@/tests/stubs/reviewBriefModel.stub.js';
import { InMemoryReviewFileGateway } from '@/tests/stubs/reviewFile.stub.js';
import { StubReviewRequestOverviewFetchGateway } from '@/tests/stubs/reviewRequestOverview.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';
import { InMemoryThreadFetchGateway } from '@/tests/stubs/threadFetch.stub.js';

const LOCAL_PATH = '/repos/sample-project';
const MR_NUMBER = 42;

function input(overrides: Partial<ExplainReviewRequestInput> = {}): ExplainReviewRequestInput {
  return {
    localPath: LOCAL_PATH,
    mrNumber: MR_NUMBER,
    refresh: false,
    language: 'en',
    ...overrides,
  };
}

describe('ExplainReviewRequestUseCase', () => {
  let tracking: InMemoryReviewRequestTrackingGateway;
  let overview: StubReviewRequestOverviewFetchGateway;
  let changedFiles: StubChangedFilesFetchGateway;
  let threads: InMemoryThreadFetchGateway;
  let reviewFiles: InMemoryReviewFileGateway;
  let model: StubReviewBriefModelGateway;
  let cache: InMemoryReviewBriefCacheGateway;
  let requestedPlatforms: Platform[];
  let useCase: ExplainReviewRequestUseCase;

  beforeEach(() => {
    tracking = new InMemoryReviewRequestTrackingGateway();
    tracking.create(
      LOCAL_PATH,
      TrackedMrFactory.create({ mrNumber: MR_NUMBER, platform: 'github', project: 'org/sample' }),
    );
    overview = new StubReviewRequestOverviewFetchGateway();
    overview.setOverview(MR_NUMBER, ReviewRequestOverviewFactory.create({ headSha: 'aaa111' }));
    changedFiles = new StubChangedFilesFetchGateway();
    changedFiles.setResponse(
      MR_NUMBER,
      ChangedFilesFactory.list([
        { path: 'src/billing/invoice.ts', additions: 10, deletions: 2 },
        { path: 'src/billing/tax.ts', additions: 5, deletions: 1 },
      ]),
    );
    threads = new InMemoryThreadFetchGateway();
    reviewFiles = new InMemoryReviewFileGateway();
    model = new StubReviewBriefModelGateway();
    cache = new InMemoryReviewBriefCacheGateway();
    requestedPlatforms = [];
    useCase = new ExplainReviewRequestUseCase({
      trackingGateway: tracking,
      overviewFetchFor: (platform) => {
        requestedPlatforms.push(platform);
        return overview;
      },
      changedFilesFetchFor: () => changedFiles,
      threadFetchFor: () => threads,
      reviewFileGateway: reviewFiles,
      modelGateway: model,
      cacheGateway: cache,
      now: () => new Date('2026-11-26T10:00:00.000Z'),
    });
  });

  describe('tracking lookup', () => {
    it('reports a number unknown in tracking as not tracked', async () => {
      const result = await useCase.execute(input({ mrNumber: 999 }));

      expect(result).toEqual({ status: 'not-tracked' });
      expect(model.requests).toHaveLength(0);
    });

    it('reports a project without tracking as not tracked', async () => {
      const result = await useCase.execute(input({ localPath: '/repos/other' }));

      expect(result).toEqual({ status: 'not-tracked' });
    });

    it('reads the platform with the tracked platform and project path', async () => {
      await useCase.execute(input());

      expect(requestedPlatforms).toEqual(['github']);
      expect(overview.fetchedProjectPaths).toEqual(['org/sample']);
      expect(changedFiles.lastProjectIdentifier).toBe('org/sample');
    });
  });

  describe('brief generation', () => {
    it('explains the request with the model output', async () => {
      model.respondWith(JSON.stringify(ReviewBriefFactory.modelOutput({ what: 'Adds taxes' })));

      const result = await useCase.execute(input());

      expect(result.status).toBe('explained');
      if (result.status !== 'explained') return;
      expect(result.brief.what).toBe('Adds taxes');
    });

    it('takes the head sha from the platform and the date from the clock', async () => {
      const result = await useCase.execute(input());

      if (result.status !== 'explained') throw new Error('expected a brief');
      expect(result.brief.headSha).toBe('aaa111');
      expect(result.brief.mrNumber).toBe(MR_NUMBER);
      expect(result.brief.generatedAt).toBe('2026-11-26T10:00:00.000Z');
    });

    it('computes the size from the changed files', async () => {
      const result = await useCase.execute(input());

      if (result.status !== 'explained') throw new Error('expected a brief');
      expect(result.brief.size).toEqual({ additions: 15, deletions: 3, changedFiles: 2 });
    });

    it('asks the model in the requested language from the project directory', async () => {
      await useCase.execute(input({ language: 'fr' }));

      expect(model.requests[0].systemPrompt).toContain('French');
      expect(model.requests[0].localPath).toBe(LOCAL_PATH);
    });

    it('gives the model the title, description and changed files', async () => {
      overview.setOverview(
        MR_NUMBER,
        ReviewRequestOverviewFactory.create({ title: 'VAT title', description: 'VAT body' }),
      );

      await useCase.execute(input());

      const material = model.requests[0].material;
      expect(material).toContain('VAT title');
      expect(material).toContain('VAT body');
      expect(material).toContain('+10 -2 src/billing/invoice.ts');
    });

    it('caches the brief it produced', async () => {
      await useCase.execute(input());

      expect(cache.size).toBe(1);
    });
  });

  describe('material', () => {
    it('gives the model the latest review report of that number only', async () => {
      reviewFiles.addReview(LOCAL_PATH, '2026-11-20-PR-7-review.md', 'Report of another request');
      reviewFiles.addReview(LOCAL_PATH, '2026-11-21-PR-42-review.md', 'Report of this request');

      await useCase.execute(input());

      const material = model.requests[0].material;
      expect(material).toContain('Report of this request');
      expect(material).not.toContain('Report of another request');
    });

    it('gives the model the review threads', async () => {
      threads.setThreads([
        ReviewContextFactory.createThread({
          comments: [{ author: 'alice', body: 'Why round here?', createdAt: '' }],
        }),
      ]);

      await useCase.execute(input());

      expect(model.requests[0].material).toContain('alice: Why round here?');
    });

    it('still explains the request when the threads cannot be fetched', async () => {
      threads.setFailure(new Error('platform down'));

      const result = await useCase.execute(input());

      expect(result.status).toBe('explained');
    });
  });

  describe('cache', () => {
    it('serves a cached brief for the same head sha and language without calling the model', async () => {
      const first = await useCase.execute(input());
      const second = await useCase.execute(input());

      expect(second).toEqual(first);
      expect(model.requests).toHaveLength(1);
      expect(changedFiles.fetchCallCount).toBe(1);
    });

    it('calls the model again when the head sha changed', async () => {
      await useCase.execute(input());
      overview.setOverview(MR_NUMBER, ReviewRequestOverviewFactory.create({ headSha: 'bbb222' }));

      const result = await useCase.execute(input());

      expect(model.requests).toHaveLength(2);
      if (result.status !== 'explained') throw new Error('expected a brief');
      expect(result.brief.headSha).toBe('bbb222');
    });

    it('calls the model again for another language', async () => {
      await useCase.execute(input({ language: 'fr' }));
      await useCase.execute(input({ language: 'en' }));

      expect(model.requests).toHaveLength(2);
    });

    it('regenerates and replaces the cached brief on refresh', async () => {
      await useCase.execute(input());
      model.respondWith(JSON.stringify(ReviewBriefFactory.modelOutput({ what: 'Regenerated' })));

      await useCase.execute(input({ refresh: true }));
      const served = await useCase.execute(input());

      expect(model.requests).toHaveLength(2);
      if (served.status !== 'explained') throw new Error('expected a brief');
      expect(served.brief.what).toBe('Regenerated');
    });
  });

  describe('failures', () => {
    it('fails when the overview cannot be fetched', async () => {
      overview.setOverview(MR_NUMBER, null);

      const result = await useCase.execute(input());

      expect(result).toEqual({ status: 'generation-failed', reason: 'overview-unavailable' });
      expect(model.requests).toHaveLength(0);
    });

    it('fails when the changed files cannot be fetched', async () => {
      changedFiles.setResponse(MR_NUMBER, null);

      const result = await useCase.execute(input());

      expect(result).toEqual({ status: 'generation-failed', reason: 'changed-files-unavailable' });
      expect(model.requests).toHaveLength(0);
    });

    it('fails with the transport reason and caches nothing when the model fails', async () => {
      model.failWith('review-brief-timeout');

      const result = await useCase.execute(input());

      expect(result).toEqual({ status: 'generation-failed', reason: 'review-brief-timeout' });
      expect(cache.size).toBe(0);
    });

    it('fails and caches nothing when the model answer breaks the schema', async () => {
      model.respondWith('This change refactors billing.');

      const result = await useCase.execute(input());

      expect(result).toEqual({ status: 'generation-failed', reason: 'invalid-model-output' });
      expect(cache.size).toBe(0);
    });
  });
});
