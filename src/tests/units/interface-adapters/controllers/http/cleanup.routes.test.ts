import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach } from 'vitest';

import { cleanupRoutes } from '@/modules/data-lifecycle/interface-adapters/controllers/http/cleanup.routes.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { InMemoryReviewFileGateway } from '@/tests/stubs/reviewFile.stub.js';
import { InMemoryReviewLogFileGateway } from '@/tests/stubs/reviewLogFile.stub.js';

describe('cleanup routes', () => {
  let application: FastifyInstance;
  let reviewFileGateway: InMemoryReviewFileGateway;
  let reviewLogFileGateway: InMemoryReviewLogFileGateway;

  beforeEach(async () => {
    reviewFileGateway = new InMemoryReviewFileGateway();
    reviewLogFileGateway = new InMemoryReviewLogFileGateway();

    application = Fastify();
    await application.register(cleanupRoutes, {
      reviewFileGateway,
      reviewLogFileGateway,
      getRepositories: () => [
        { localPath: '/project-a', enabled: true },
        { localPath: '/project-b', enabled: false },
      ],
      logger: createStubLogger(),
    });
    await application.ready();
  });

  it('should return success with zero deleted files when no expired files exist', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/api/reviews/cleanup',
    });

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deletedCount).toBe(0);
  });

  it('should cleanup only enabled repositories', async () => {
    reviewFileGateway.addReview('/project-a', '2020-01-01-MR-1-review.md', '# Old review');
    reviewFileGateway.addReview(
      '/project-b',
      '2020-01-01-MR-2-review.md',
      '# Old review disabled repo',
    );

    const response = await application.inject({
      method: 'POST',
      url: '/api/reviews/cleanup',
    });

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.deletedCount).toBe(1);
    expect(body.deletedFiles).toContain('2020-01-01-MR-1-review.md');
    expect(body.deletedFiles).not.toContain('2020-01-01-MR-2-review.md');
  });

  it('should cleanup single project when path query parameter is provided', async () => {
    reviewFileGateway.addReview('/project-a', '2020-01-01-MR-1-review.md', '# Old review A');
    reviewFileGateway.addReview(
      '/specific/project',
      '2020-01-01-MR-3-review.md',
      '# Old review specific',
    );

    const response = await application.inject({
      method: 'POST',
      url: '/api/reviews/cleanup?path=/specific/project',
    });

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.deletedCount).toBe(1);
    expect(body.deletedFiles).toContain('2020-01-01-MR-3-review.md');
  });
});
