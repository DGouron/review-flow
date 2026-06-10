import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type {
  ReviewReportContent,
  ReviewReportGateway,
  ReviewReportLocation,
} from '@/modules/claude-invocation/entities/sessionCompletion/reviewReport.gateway.js';

export interface ReviewReportFileSystem {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => string;
  readdirSync: (path: string) => string[];
}

const defaultFs: ReviewReportFileSystem = {
  existsSync,
  readFileSync: (path: string) => readFileSync(path, 'utf-8'),
  readdirSync: (path: string) => readdirSync(path),
};

export class ReviewReportFileSystemGateway implements ReviewReportGateway {
  constructor(private readonly fs: ReviewReportFileSystem = defaultFs) {}

  buildPath(location: ReviewReportLocation): string {
    const suffix = suffixFor(location.jobType);
    const fileName = `${location.isoDate}-MR-${location.mergeRequestNumber}-${suffix}.md`;
    return join(location.localPath, '.claude', 'reviews', fileName);
  }

  read(location: ReviewReportLocation): ReviewReportContent | null {
    const exactPath = this.buildPath(location);
    if (this.fs.existsSync(exactPath)) {
      return { content: this.fs.readFileSync(exactPath), path: exactPath };
    }

    // Fallback: the report file's date prefix may differ from the lookup date
    // (e.g. midnight UTC vs local), so we scan for any *-MR-<N>-<suffix>.md.
    const reviewsDir = join(location.localPath, '.claude', 'reviews');
    if (!this.fs.existsSync(reviewsDir)) {
      return null;
    }
    const pattern = matcherFor(location);
    const match = this.fs.readdirSync(reviewsDir).find(pattern);
    if (!match) {
      return null;
    }
    const resolved = join(reviewsDir, match);
    return { content: this.fs.readFileSync(resolved), path: resolved };
  }
}

function suffixFor(jobType: ReviewReportLocation['jobType']): string {
  return jobType === 'followup' ? 'followup' : 'review';
}

function matcherFor(location: ReviewReportLocation): (name: string) => boolean {
  const suffix = suffixFor(location.jobType);
  const tail = `-MR-${location.mergeRequestNumber}-${suffix}.md`;
  return (name) => name.endsWith(tail) && /^\d{4}-\d{2}-\d{2}/.test(name);
}
