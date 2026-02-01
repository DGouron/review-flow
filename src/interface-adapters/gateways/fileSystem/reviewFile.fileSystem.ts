import { readdir, stat, readFile, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReviewFileGateway, ReviewFileInfo } from '../reviewFile.gateway.js';

export class FileSystemReviewFileGateway implements ReviewFileGateway {
  async listReviews(projectPath: string): Promise<ReviewFileInfo[]> {
    const reviewsDir = this.getReviewsDirectory(projectPath);
    const reviews: ReviewFileInfo[] = [];

    try {
      const files = await readdir(reviewsDir);

      for (const filename of files) {
        if (!filename.endsWith('.md')) continue;

        const filePath = join(reviewsDir, filename);
        const match = filename.match(/^(\d{4}-\d{2}-\d{2})-MR-([^-]+)-(.+)\.md$/);

        if (match) {
          try {
            const fileStat = await stat(filePath);
            reviews.push({
              filename,
              path: filePath,
              date: match[1],
              mrNumber: match[2],
              type: match[3],
              size: fileStat.size,
              mtime: fileStat.mtime.toISOString(),
            });
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }

    return reviews.sort((a, b) => b.mtime.localeCompare(a.mtime));
  }

  async readReview(projectPath: string, filename: string): Promise<string | null> {
    const filePath = join(this.getReviewsDirectory(projectPath), filename);

    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async deleteReview(projectPath: string, filename: string): Promise<boolean> {
    const filePath = join(this.getReviewsDirectory(projectPath), filename);

    try {
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async reviewExists(projectPath: string, filename: string): Promise<boolean> {
    const filePath = join(this.getReviewsDirectory(projectPath), filename);

    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getReviewsDirectory(projectPath: string): string {
    return join(projectPath, '.claude', 'reviews');
  }
}
