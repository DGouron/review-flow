import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { reviewBriefGuard } from '@/modules/review-brief/entities/reviewBrief/reviewBrief.guard.js';
import type { ReviewBrief } from '@/modules/review-brief/entities/reviewBrief/reviewBrief.schema.js';
import type {
  ReviewBriefCacheGateway,
  ReviewBriefCacheKey,
} from '@/modules/review-brief/entities/reviewBrief/reviewBriefCache.gateway.js';

export interface ReviewBriefCacheFileSystemGatewayOptions {
  homeDir: string;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Briefs cached under ~/.claude-review/review-briefs/<project-slug>/, one file per platform,
 * request number, head sha and language — never inside the reviewed repository. A corrupted or
 * invalid file is a miss, so the brief is simply regenerated.
 */
export class ReviewBriefCacheFileSystemGateway implements ReviewBriefCacheGateway {
  private readonly directory: string;

  constructor(options: ReviewBriefCacheFileSystemGatewayOptions) {
    this.directory = join(options.homeDir, '.claude-review', 'review-briefs');
  }

  async load(key: ReviewBriefCacheKey): Promise<ReviewBrief | null> {
    const path = this.fileFor(key);
    if (!existsSync(path)) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
      const result = reviewBriefGuard.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  async save(key: ReviewBriefCacheKey, brief: ReviewBrief): Promise<void> {
    mkdirSync(this.projectDirectoryFor(key), { recursive: true });
    writeFileSync(this.fileFor(key), JSON.stringify(brief), 'utf-8');
  }

  private projectDirectoryFor(key: ReviewBriefCacheKey): string {
    return join(this.directory, safeSegment(key.localPath));
  }

  private fileFor(key: ReviewBriefCacheKey): string {
    const name = [key.platform, key.mrNumber, safeSegment(key.headSha), key.language].join('-');
    return join(this.projectDirectoryFor(key), `${name}.json`);
  }
}
