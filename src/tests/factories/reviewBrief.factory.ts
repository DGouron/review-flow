import type {
  ReviewBrief,
  ReviewBriefModelOutput,
} from '@/modules/review-brief/entities/reviewBrief/reviewBrief.schema.js';

export class ReviewBriefFactory {
  static modelOutput(overrides: Partial<ReviewBriefModelOutput> = {}): ReviewBriefModelOutput {
    return {
      what: 'Adds tax computation to invoices',
      problem: 'Invoices were issued without VAT',
      risks: ['Rounding differences on multi-line invoices'],
      toCheck: ['Totals of an invoice with three lines'],
      areas: ['billing'],
      ...overrides,
    };
  }

  static create(overrides: Partial<ReviewBrief> = {}): ReviewBrief {
    return {
      ...ReviewBriefFactory.modelOutput(),
      mrNumber: 42,
      headSha: 'aaa111',
      generatedAt: '2026-11-26T10:00:00.000Z',
      size: { additions: 15, deletions: 3, changedFiles: 2 },
      ...overrides,
    };
  }
}
