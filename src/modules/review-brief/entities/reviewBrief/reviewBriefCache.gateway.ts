import type { ReviewBrief } from '@/modules/review-brief/entities/reviewBrief/reviewBrief.schema.js';
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';
import type { Platform } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';

export type ReviewBriefCacheKey = {
  localPath: string;
  platform: Platform;
  mrNumber: number;
  headSha: string;
  language: Language;
};

export interface ReviewBriefCacheGateway {
  load(key: ReviewBriefCacheKey): Promise<ReviewBrief | null>;
  save(key: ReviewBriefCacheKey, brief: ReviewBrief): Promise<void>;
}
