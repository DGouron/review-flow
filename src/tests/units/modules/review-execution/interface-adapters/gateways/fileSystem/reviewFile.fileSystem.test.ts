import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { FileSystemReviewFileGateway } from '@/modules/review-execution/interface-adapters/gateways/fileSystem/reviewFile.fileSystem.js';

function reviewsDir(projectPath: string): string {
  const dir = join(projectPath, '.claude', 'reviews');
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('FileSystemReviewFileGateway (integration with real filesystem)', () => {
  let projectPath: string;
  let gateway: FileSystemReviewFileGateway;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'review-file-'));
    gateway = new FileSystemReviewFileGateway();
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  describe('getReviewsDirectory', () => {
    it('returns the .claude/reviews directory under the project path', () => {
      expect(gateway.getReviewsDirectory('/my/project')).toBe('/my/project/.claude/reviews');
    });
  });

  describe('listReviews', () => {
    it('returns an empty array when the reviews directory does not exist', async () => {
      const result = await gateway.listReviews(projectPath);

      expect(result).toEqual([]);
    });

    it('parses metadata and title for MR and PR review files, sorted by mtime desc', async () => {
      const dir = reviewsDir(projectPath);
      writeFileSync(
        join(dir, '2024-01-15-MR-42-review.md'),
        '# Code Review - MR !42 (fix: resolve bug)\n\nbody',
      );
      writeFileSync(
        join(dir, '2024-01-16-PR-123-review.md'),
        '# Code Review - PR #123 (feat: add feature)\n\nbody',
      );

      const result = await gateway.listReviews(projectPath);

      expect(result).toHaveLength(2);
      const byNumber = new Map(result.map((review) => [review.mrNumber, review]));
      const mrReview = byNumber.get('42');
      const prReview = byNumber.get('123');
      expect(mrReview?.date).toBe('2024-01-15');
      expect(mrReview?.type).toBe('review');
      expect(mrReview?.title).toBe('fix: resolve bug');
      expect(mrReview?.size).toBeGreaterThan(0);
      expect(mrReview?.path).toBe(join(dir, '2024-01-15-MR-42-review.md'));
      expect(prReview?.title).toBe('feat: add feature');
      expect(typeof prReview?.mtime).toBe('string');
    });

    it('leaves the title absent when the first line does not match the title format', async () => {
      const dir = reviewsDir(projectPath);
      writeFileSync(join(dir, '2024-01-15-PR-7-review.md'), '# Some other heading\n\nbody');

      const result = await gateway.listReviews(projectPath);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBeUndefined();
    });

    it('ignores non-markdown files and markdown files not matching the review pattern', async () => {
      const dir = reviewsDir(projectPath);
      writeFileSync(join(dir, '2024-01-15-MR-42-review.md'), '# Code Review - MR !42 (ok)\n');
      writeFileSync(join(dir, 'notes.txt'), 'plain text');
      writeFileSync(join(dir, 'random.md'), '# not a review');

      const result = await gateway.listReviews(projectPath);

      expect(result).toHaveLength(1);
      expect(result[0].mrNumber).toBe('42');
    });
  });

  describe('readReview', () => {
    it('returns the file content when the review exists', async () => {
      const dir = reviewsDir(projectPath);
      writeFileSync(join(dir, '2024-01-15-MR-42-review.md'), '# Review\n\nContent here');

      const result = await gateway.readReview(projectPath, '2024-01-15-MR-42-review.md');

      expect(result).toBe('# Review\n\nContent here');
    });

    it('returns null when the review file is missing', async () => {
      const result = await gateway.readReview(projectPath, 'missing.md');

      expect(result).toBeNull();
    });
  });

  describe('reviewExists', () => {
    it('returns true when the review file exists', async () => {
      const dir = reviewsDir(projectPath);
      writeFileSync(join(dir, '2024-01-15-MR-42-review.md'), 'Content');

      const result = await gateway.reviewExists(projectPath, '2024-01-15-MR-42-review.md');

      expect(result).toBe(true);
    });

    it('returns false when the review file is missing', async () => {
      const result = await gateway.reviewExists(projectPath, 'missing.md');

      expect(result).toBe(false);
    });
  });

  describe('deleteReview', () => {
    it('deletes an existing review and returns true', async () => {
      const dir = reviewsDir(projectPath);
      writeFileSync(join(dir, '2024-01-15-MR-42-review.md'), 'Content');

      const result = await gateway.deleteReview(projectPath, '2024-01-15-MR-42-review.md');

      expect(result).toBe(true);
      expect(await gateway.reviewExists(projectPath, '2024-01-15-MR-42-review.md')).toBe(false);
    });

    it('returns false when the review file is missing', async () => {
      const result = await gateway.deleteReview(projectPath, 'missing.md');

      expect(result).toBe(false);
    });
  });
});
