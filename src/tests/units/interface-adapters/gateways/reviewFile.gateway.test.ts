import { describe, it, expect } from 'vitest';
import { InMemoryReviewFileGateway } from '../../../stubs/reviewFile.stub.js';

describe('ReviewFileGateway', () => {
  describe('listReviews', () => {
    it('should return empty array when no reviews exist', async () => {
      const gateway = new InMemoryReviewFileGateway();

      const result = await gateway.listReviews('/my/project');

      expect(result).toEqual([]);
    });

    it('should list MR review files with parsed metadata', async () => {
      const gateway = new InMemoryReviewFileGateway();
      gateway.addReview('/my/project', '2024-01-15-MR-42-review.md', '# Review content');

      const result = await gateway.listReviews('/my/project');

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].mrNumber).toBe('42');
      expect(result[0].type).toBe('review');
    });

    it('should list PR review files with parsed metadata (GitHub support)', async () => {
      const gateway = new InMemoryReviewFileGateway();
      gateway.addReview('/my/project', '2024-01-15-PR-123-review.md', '# PR Review content');

      const result = await gateway.listReviews('/my/project');

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].mrNumber).toBe('123');
      expect(result[0].type).toBe('review');
    });

    it('should list both MR and PR review files together', async () => {
      const gateway = new InMemoryReviewFileGateway();
      gateway.addReview('/my/project', '2024-01-15-MR-42-review.md', '# MR Review');
      gateway.addReview('/my/project', '2024-01-16-PR-123-review.md', '# PR Review');

      const result = await gateway.listReviews('/my/project');

      expect(result).toHaveLength(2);
      const mrNumbers = result.map(r => r.mrNumber);
      expect(mrNumbers).toContain('42');
      expect(mrNumbers).toContain('123');
    });

    it('should extract title from review file content', async () => {
      const gateway = new InMemoryReviewFileGateway();
      const content = `# Code Review - PR #123 (feat: add new feature)

**Date**: 2024-01-15
**Reviewer**: Claude Code`;
      gateway.addReview('/my/project', '2024-01-15-PR-123-review.md', content);

      const result = await gateway.listReviews('/my/project');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('feat: add new feature');
    });

    it('should handle MR title format (GitLab)', async () => {
      const gateway = new InMemoryReviewFileGateway();
      const content = `# Code Review - MR !42 (fix: resolve bug in login)

**Date**: 2024-01-15`;
      gateway.addReview('/my/project', '2024-01-15-MR-42-review.md', content);

      const result = await gateway.listReviews('/my/project');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('fix: resolve bug in login');
    });

    it('should return undefined title when format not matched', async () => {
      const gateway = new InMemoryReviewFileGateway();
      const content = `# Some other format

No title here`;
      gateway.addReview('/my/project', '2024-01-15-PR-123-review.md', content);

      const result = await gateway.listReviews('/my/project');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBeUndefined();
    });

    it('should only list reviews for specified project', async () => {
      const gateway = new InMemoryReviewFileGateway();
      gateway.addReview('/project-a', '2024-01-15-MR-1-review.md', 'Review A');
      gateway.addReview('/project-b', '2024-01-15-MR-2-review.md', 'Review B');

      const result = await gateway.listReviews('/project-a');

      expect(result).toHaveLength(1);
      expect(result[0].mrNumber).toBe('1');
    });
  });

  describe('readReview', () => {
    it('should return null when review does not exist', async () => {
      const gateway = new InMemoryReviewFileGateway();

      const result = await gateway.readReview('/my/project', 'nonexistent.md');

      expect(result).toBeNull();
    });

    it('should return review content', async () => {
      const gateway = new InMemoryReviewFileGateway();
      gateway.addReview('/my/project', '2024-01-15-MR-42-review.md', '# Review\n\nContent here');

      const result = await gateway.readReview('/my/project', '2024-01-15-MR-42-review.md');

      expect(result).toBe('# Review\n\nContent here');
    });
  });

  describe('deleteReview', () => {
    it('should return false when review does not exist', async () => {
      const gateway = new InMemoryReviewFileGateway();

      const result = await gateway.deleteReview('/my/project', 'nonexistent.md');

      expect(result).toBe(false);
    });

    it('should delete review and return true', async () => {
      const gateway = new InMemoryReviewFileGateway();
      gateway.addReview('/my/project', '2024-01-15-MR-42-review.md', 'Content');

      const result = await gateway.deleteReview('/my/project', '2024-01-15-MR-42-review.md');

      expect(result).toBe(true);
      expect(await gateway.reviewExists('/my/project', '2024-01-15-MR-42-review.md')).toBe(false);
    });
  });

  describe('reviewExists', () => {
    it('should return false when review does not exist', async () => {
      const gateway = new InMemoryReviewFileGateway();

      const result = await gateway.reviewExists('/my/project', 'nonexistent.md');

      expect(result).toBe(false);
    });

    it('should return true when review exists', async () => {
      const gateway = new InMemoryReviewFileGateway();
      gateway.addReview('/my/project', '2024-01-15-MR-42-review.md', 'Content');

      const result = await gateway.reviewExists('/my/project', '2024-01-15-MR-42-review.md');

      expect(result).toBe(true);
    });
  });

  describe('getReviewsDirectory', () => {
    it('should return the reviews directory path', () => {
      const gateway = new InMemoryReviewFileGateway();

      const result = gateway.getReviewsDirectory('/my/project');

      expect(result).toBe('/my/project/.claude/reviews');
    });
  });
});
