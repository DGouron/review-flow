import type { ReviewRequestOverview } from '@/modules/review-brief/entities/reviewBrief/reviewRequestOverview.gateway.js';

export class ReviewRequestOverviewFactory {
  static create(overrides: Partial<ReviewRequestOverview> = {}): ReviewRequestOverview {
    return {
      title: 'Add VAT to invoices',
      description: 'Invoices must show VAT per line.',
      headSha: 'aaa111',
      ...overrides,
    };
  }
}
