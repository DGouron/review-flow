import type { ReviewEvent } from '@/modules/tracking/entities/tracking/reviewEvent.js';

export class ReviewEventFactory {
  static create(overrides: Partial<ReviewEvent> = {}): ReviewEvent {
    return {
      type: 'review',
      timestamp: '2026-11-25T10:00:00Z',
      durationMs: 1000,
      score: null,
      blocking: 0,
      warnings: 0,
      suggestions: 0,
      threadsClosed: 0,
      threadsOpened: 0,
      diffStats: null,
      verdict: null,
      grade: null,
      ...overrides,
    };
  }
}
