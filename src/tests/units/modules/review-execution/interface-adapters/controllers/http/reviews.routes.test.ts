import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { reviewRoutes } from '@/modules/review-execution/interface-adapters/controllers/http/reviews.routes.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { InMemoryReviewFileGateway } from '@/tests/stubs/reviewFile.stub.js';
import { StubReviewQueuePort } from '@/tests/stubs/reviewQueue.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

type Repository = { localPath: string; enabled: boolean };

describe('reviewRoutes', () => {
  let app: FastifyInstance;
  let reviewFileGateway: InMemoryReviewFileGateway;
  let reviewRequestTrackingGateway: InMemoryReviewRequestTrackingGateway;
  let queuePort: StubReviewQueuePort;
  let repositories: Repository[];

  beforeEach(async () => {
    app = Fastify();
    reviewFileGateway = new InMemoryReviewFileGateway();
    reviewRequestTrackingGateway = new InMemoryReviewRequestTrackingGateway();
    queuePort = new StubReviewQueuePort();
    repositories = [];

    await app.register(reviewRoutes, {
      reviewFileGateway,
      reviewRequestTrackingGateway,
      getRepositories: () => repositories,
      queuePort,
      logger: createStubLogger(),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/reviews', () => {
    it('returns reviews for an explicit valid path', async () => {
      reviewFileGateway.addReview(
        '/repo/a',
        '2026-05-01-MR-12-front.md',
        '# Code Review - MR #12 (login)',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/reviews?path=/repo/a',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.count).toBe(1);
      expect(body.reviews[0].filename).toBe('2026-05-01-MR-12-front.md');
    });

    it('rejects a path without a leading slash', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/reviews?path=relative/path',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.error).toBe('Invalid path');
      expect(body.reviews).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('rejects a path containing directory traversal', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/reviews?path=/repo/../etc',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.error).toBe('Invalid path');
    });

    it('aggregates enabled repositories and skips disabled ones when no path is given', async () => {
      reviewFileGateway.addReview(
        '/repo/a',
        '2026-05-01-MR-1-front.md',
        '# Code Review - MR #1 (a)',
      );
      reviewFileGateway.addReview(
        '/repo/b',
        '2026-05-02-MR-2-front.md',
        '# Code Review - MR #2 (b)',
      );
      repositories = [
        { localPath: '/repo/a', enabled: true },
        { localPath: '/repo/b', enabled: false },
      ];

      const response = await app.inject({
        method: 'GET',
        url: '/api/reviews',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.count).toBe(1);
      expect(body.reviews[0].filename).toBe('2026-05-01-MR-1-front.md');
    });

    it('returns an empty aggregate when no repositories are configured', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/reviews',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.reviews).toEqual([]);
      expect(body.count).toBe(0);
    });
  });

  describe('GET /api/reviews/:filename', () => {
    it('returns 400 for an invalid filename format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/reviews/not-a-valid-name',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Invalid filename format');
    });

    it('returns the review content from an enabled repository', async () => {
      reviewFileGateway.addReview('/repo/a', '2026-05-01-MR-12-front.md', 'CONTENT');
      repositories = [{ localPath: '/repo/a', enabled: true }];

      const response = await app.inject({
        method: 'GET',
        url: '/api/reviews/2026-05-01-MR-12-front.md',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.filename).toBe('2026-05-01-MR-12-front.md');
      expect(body.content).toBe('CONTENT');
    });

    it('skips disabled repositories and returns 404 when not found anywhere', async () => {
      reviewFileGateway.addReview('/repo/a', '2026-05-01-MR-12-front.md', 'CONTENT');
      repositories = [{ localPath: '/repo/a', enabled: false }];

      const response = await app.inject({
        method: 'GET',
        url: '/api/reviews/2026-05-01-MR-12-front.md',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Review not found');
    });
  });

  describe('DELETE /api/reviews/:filename', () => {
    it('returns 400 for an invalid filename format', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/reviews/invalid',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid filename format');
    });

    it('deletes an existing review in an enabled repository', async () => {
      reviewFileGateway.addReview('/repo/a', '2026-05-01-MR-12-front.md', 'CONTENT');
      repositories = [{ localPath: '/repo/a', enabled: true }];

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/reviews/2026-05-01-MR-12-front.md',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
      expect(await reviewFileGateway.reviewExists('/repo/a', '2026-05-01-MR-12-front.md')).toBe(
        false,
      );
    });

    it('skips disabled repositories and returns 404 when nothing is deleted', async () => {
      reviewFileGateway.addReview('/repo/a', '2026-05-01-MR-12-front.md', 'CONTENT');
      repositories = [{ localPath: '/repo/a', enabled: false }];

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/reviews/2026-05-01-MR-12-front.md',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Review not found');
    });
  });

  describe('POST /api/reviews/cancel/:jobId', () => {
    it('cancels a running job without tracking removal when body is empty', async () => {
      queuePort.setJobStatus('job-1', 'running');

      const response = await app.inject({
        method: 'POST',
        url: '/api/reviews/cancel/job-1',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Job job-1 cancelled');
      expect(queuePort.cancelledJobs).toContain('job-1');
    });

    it('cancels a job and removes tracking when projectPath and mrId are provided', async () => {
      queuePort.setJobStatus('job-2', 'queued');
      reviewRequestTrackingGateway.create(
        '/repo/a',
        TrackedMrFactory.create({ id: 'mr-99', mrNumber: 99 }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/reviews/cancel/job-2',
        payload: { projectPath: '/repo/a', mrId: 'mr-99' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
      expect(reviewRequestTrackingGateway.getById('/repo/a', 'mr-99')).toBeNull();
    });

    it('returns already-completed status when the job is finished', async () => {
      queuePort.setJobStatus('job-3', 'completed');

      const response = await app.inject({
        method: 'POST',
        url: '/api/reviews/cancel/job-3',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.status).toBe('already-completed');
    });

    it('returns 404 when the job does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/reviews/cancel/unknown-job',
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Job non trouvé');
    });
  });
});
