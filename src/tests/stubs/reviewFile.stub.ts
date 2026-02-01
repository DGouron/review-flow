import { join } from 'node:path';
import type { ReviewFileGateway, ReviewFileInfo } from '../../interface-adapters/gateways/reviewFile.gateway.js';

export class InMemoryReviewFileGateway implements ReviewFileGateway {
  private files = new Map<string, string>();

  async listReviews(projectPath: string): Promise<ReviewFileInfo[]> {
    const prefix = this.getReviewsDirectory(projectPath) + '/';
    const reviews: ReviewFileInfo[] = [];

    for (const [path, content] of this.files.entries()) {
      if (!path.startsWith(prefix)) continue;

      const filename = path.slice(prefix.length);
      const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(?:MR|PR)-([^-]+)-(.+)\.md$/);
      if (match) {
        const title = this.extractTitle(content);
        reviews.push({
          filename,
          path,
          date: match[1],
          mrNumber: match[2],
          type: match[3],
          size: content.length,
          mtime: new Date().toISOString(),
          title,
        });
      }
    }

    return reviews.sort((a, b) => b.mtime.localeCompare(a.mtime));
  }

  async readReview(projectPath: string, filename: string): Promise<string | null> {
    const path = join(this.getReviewsDirectory(projectPath), filename);
    return this.files.get(path) ?? null;
  }

  async deleteReview(projectPath: string, filename: string): Promise<boolean> {
    const path = join(this.getReviewsDirectory(projectPath), filename);
    return this.files.delete(path);
  }

  async reviewExists(projectPath: string, filename: string): Promise<boolean> {
    const path = join(this.getReviewsDirectory(projectPath), filename);
    return this.files.has(path);
  }

  getReviewsDirectory(projectPath: string): string {
    return join(projectPath, '.claude', 'reviews');
  }

  addReview(projectPath: string, filename: string, content: string): void {
    const path = join(this.getReviewsDirectory(projectPath), filename);
    this.files.set(path, content);
  }

  clear(): void {
    this.files.clear();
  }

  private extractTitle(content: string): string | undefined {
    const firstLine = content.split('\n')[0];
    const match = firstLine.match(/^# Code Review - (?:MR|PR) [#!]\d+ \((.+)\)$/);
    return match?.[1];
  }
}
