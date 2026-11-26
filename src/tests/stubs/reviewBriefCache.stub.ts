import type { ReviewBrief } from '@/modules/review-brief/entities/reviewBrief/reviewBrief.schema.js';
import type {
  ReviewBriefCacheGateway,
  ReviewBriefCacheKey,
} from '@/modules/review-brief/entities/reviewBrief/reviewBriefCache.gateway.js';

function keyOf(key: ReviewBriefCacheKey): string {
  return [key.localPath, key.platform, key.mrNumber, key.headSha, key.language].join('|');
}

export class InMemoryReviewBriefCacheGateway implements ReviewBriefCacheGateway {
  private entries = new Map<string, ReviewBrief>();

  async load(key: ReviewBriefCacheKey): Promise<ReviewBrief | null> {
    return this.entries.get(keyOf(key)) ?? null;
  }

  async save(key: ReviewBriefCacheKey, brief: ReviewBrief): Promise<void> {
    this.entries.set(keyOf(key), brief);
  }

  get size(): number {
    return this.entries.size;
  }
}
