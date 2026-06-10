import { describe, it, expect } from 'vitest';

import { cleanupExpiredReviews } from '@/modules/data-lifecycle/usecases/cleanup/cleanupExpiredReviews.usecase.js';
import { InMemoryReviewFileGateway } from '@/tests/stubs/reviewFile.stub.js';
import { InMemoryReviewLogFileGateway } from '@/tests/stubs/reviewLogFile.stub.js';

describe('cleanupExpiredReviews', () => {
  const now = new Date('2026-03-14');

  it('should return empty result when no files exist', async () => {
    const reviewFileGateway = new InMemoryReviewFileGateway();
    const reviewLogFileGateway = new InMemoryReviewLogFileGateway();

    const result = await cleanupExpiredReviews(
      '/my/project',
      14,
      {
        reviewFileGateway,
        reviewLogFileGateway,
      },
      now,
    );

    expect(result.deletedReviewFiles).toEqual([]);
    expect(result.deletedLogFiles).toEqual([]);
    expect(result.totalDeletedCount).toBe(0);
  });

  it('should delete expired review files based on filename date', async () => {
    const reviewFileGateway = new InMemoryReviewFileGateway();
    const reviewLogFileGateway = new InMemoryReviewLogFileGateway();

    reviewFileGateway.addReview('/my/project', '2026-02-01-MR-42-review.md', '# Old review');
    reviewFileGateway.addReview('/my/project', '2026-03-13-MR-99-review.md', '# Recent review');

    const result = await cleanupExpiredReviews(
      '/my/project',
      14,
      {
        reviewFileGateway,
        reviewLogFileGateway,
      },
      now,
    );

    expect(result.deletedReviewFiles).toEqual(['2026-02-01-MR-42-review.md']);
    expect(result.totalDeletedCount).toBe(1);
    expect(await reviewFileGateway.reviewExists('/my/project', '2026-02-01-MR-42-review.md')).toBe(
      false,
    );
    expect(await reviewFileGateway.reviewExists('/my/project', '2026-03-13-MR-99-review.md')).toBe(
      true,
    );
  });

  it('should delete expired log files based on mtime', async () => {
    const reviewFileGateway = new InMemoryReviewFileGateway();
    const reviewLogFileGateway = new InMemoryReviewLogFileGateway();

    reviewLogFileGateway.addLogFile('/my/project', 'old-stdout.log', {
      mtime: '2026-02-01T00:00:00.000Z',
      size: 1024,
    });
    reviewLogFileGateway.addLogFile('/my/project', 'recent-stdout.log', {
      mtime: '2026-03-13T00:00:00.000Z',
      size: 512,
    });

    const result = await cleanupExpiredReviews(
      '/my/project',
      14,
      {
        reviewFileGateway,
        reviewLogFileGateway,
      },
      now,
    );

    expect(result.deletedLogFiles).toEqual(['old-stdout.log']);
    expect(result.totalDeletedCount).toBe(1);
  });

  it('should delete both expired review files and log files', async () => {
    const reviewFileGateway = new InMemoryReviewFileGateway();
    const reviewLogFileGateway = new InMemoryReviewLogFileGateway();

    reviewFileGateway.addReview('/my/project', '2026-01-15-MR-10-review.md', '# Very old review');
    reviewLogFileGateway.addLogFile('/my/project', 'old-stdout.log', {
      mtime: '2026-01-15T00:00:00.000Z',
      size: 1024,
    });

    const result = await cleanupExpiredReviews(
      '/my/project',
      14,
      {
        reviewFileGateway,
        reviewLogFileGateway,
      },
      now,
    );

    expect(result.deletedReviewFiles).toEqual(['2026-01-15-MR-10-review.md']);
    expect(result.deletedLogFiles).toEqual(['old-stdout.log']);
    expect(result.totalDeletedCount).toBe(2);
  });

  it('should keep all files when none are expired', async () => {
    const reviewFileGateway = new InMemoryReviewFileGateway();
    const reviewLogFileGateway = new InMemoryReviewLogFileGateway();

    reviewFileGateway.addReview('/my/project', '2026-03-10-MR-42-review.md', '# Recent review');
    reviewLogFileGateway.addLogFile('/my/project', 'recent-stdout.log', {
      mtime: '2026-03-10T00:00:00.000Z',
      size: 512,
    });

    const result = await cleanupExpiredReviews(
      '/my/project',
      14,
      {
        reviewFileGateway,
        reviewLogFileGateway,
      },
      now,
    );

    expect(result.deletedReviewFiles).toEqual([]);
    expect(result.deletedLogFiles).toEqual([]);
    expect(result.totalDeletedCount).toBe(0);
  });
});
