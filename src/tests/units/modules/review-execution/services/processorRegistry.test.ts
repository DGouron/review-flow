import { describe, it, expect, vi } from 'vitest';

import type { ReviewJob } from '@/frameworks/queue/pQueueAdapter.js';
import { ProcessorRegistry } from '@/modules/review-execution/services/processorRegistry.js';
import { PendingReviewRequestFactory } from '@/tests/factories/pendingReviewRequest.factory.js';

describe('ProcessorRegistry', () => {
  it('resolves a registered builder using triggerSource:platform:jobType', () => {
    const registry = new ProcessorRegistry();
    const processor = vi.fn(async () => {});
    const builder = vi.fn((_job: ReviewJob) => processor);

    registry.register(
      { triggerSource: 'webhook-initial', platform: 'gitlab', jobType: 'review' },
      builder,
    );

    const pending = PendingReviewRequestFactory.create({
      triggerSource: 'webhook-initial',
      platform: 'gitlab',
      jobType: 'review',
    });
    const resolved = registry.resolve(pending);

    expect(builder).toHaveBeenCalledWith(pending.job);
    expect(resolved).toBe(processor);
  });

  it('throws a descriptive error when no builder is registered for the key', () => {
    const registry = new ProcessorRegistry();
    const pending = PendingReviewRequestFactory.create({
      triggerSource: 'dashboard-manual',
      platform: 'github',
      jobType: 'followup',
    });

    expect(() => registry.resolve(pending)).toThrow(/No processor builder registered/);
    expect(() => registry.resolve(pending)).toThrow(/dashboard-manual:github:followup/);
  });

  it('lists available keys in the error message when builder is missing', () => {
    const registry = new ProcessorRegistry();
    registry.register(
      { triggerSource: 'webhook-initial', platform: 'gitlab', jobType: 'review' },
      vi.fn(),
    );
    const pending = PendingReviewRequestFactory.create({
      triggerSource: 'webhook-followup',
      platform: 'github',
      jobType: 'followup',
    });

    expect(() => registry.resolve(pending)).toThrow(
      /Available keys.*webhook-initial:gitlab:review/,
    );
  });

  it('replaces an existing builder when register is called twice with the same key', () => {
    const registry = new ProcessorRegistry();
    const oldProcessor = vi.fn(async () => {});
    const newProcessor = vi.fn(async () => {});
    registry.register(
      { triggerSource: 'webhook-initial', platform: 'gitlab', jobType: 'review' },
      () => oldProcessor,
    );
    registry.register(
      { triggerSource: 'webhook-initial', platform: 'gitlab', jobType: 'review' },
      () => newProcessor,
    );

    const pending = PendingReviewRequestFactory.create({
      triggerSource: 'webhook-initial',
      platform: 'gitlab',
      jobType: 'review',
    });
    const resolved = registry.resolve(pending);

    expect(resolved).toBe(newProcessor);
  });
});
