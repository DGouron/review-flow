import { describe, it, expect } from 'vitest';

import { PendingReviewPresenter } from '@/modules/review-execution/interface-adapters/presenters/pendingReview.presenter.js';
import { PendingReviewRequestFactory } from '@/tests/factories/pendingReviewRequest.factory.js';

describe('PendingReviewPresenter', () => {
  it('builds a view model for an initial review pending request', () => {
    const presenter = new PendingReviewPresenter({ now: () => new Date('2026-05-23T10:02:00Z') });
    const pending = PendingReviewRequestFactory.create({
      createdAt: '2026-05-23T10:00:00.000Z',
    });

    const viewModel = presenter.present(pending);

    expect(viewModel.identifier).toBe(pending.pendingReviewRequestId);
    expect(viewModel.mrNumber).toBe(42);
    expect(viewModel.projectPath).toBe('group/project');
    expect(viewModel.mrUrl).toBe(pending.job.mrUrl);
    expect(viewModel.jobTypeLabel).toBe('Review');
    expect(viewModel.triggerSourceLabel).toBe('Webhook');
    expect(viewModel.displayTitle).toContain('!42');
    expect(viewModel.confirmActionUrl).toBe(
      `/api/pending-reviews/${pending.pendingReviewRequestId}/confirm`,
    );
    expect(viewModel.dismissActionUrl).toBe(
      `/api/pending-reviews/${pending.pendingReviewRequestId}`,
    );
    expect(viewModel.createdAtRelative).toMatch(/2/);
  });

  it('labels followup job type as "Followup"', () => {
    const presenter = new PendingReviewPresenter();
    const pending = PendingReviewRequestFactory.create({
      jobType: 'followup',
      triggerSource: 'webhook-followup',
    });

    const viewModel = presenter.present(pending);

    expect(viewModel.jobTypeLabel).toBe('Followup');
  });

  it('labels the dashboard-manual trigger source as "Manuel"', () => {
    const presenter = new PendingReviewPresenter();
    const pending = PendingReviewRequestFactory.create({
      triggerSource: 'dashboard-manual',
    });

    const viewModel = presenter.present(pending);

    expect(viewModel.triggerSourceLabel).toBe('Manuel');
  });
});
