import { describe, it, expect } from 'vitest';

import {
  buildPendingReviewsModel,
  renderPendingReviewsHtml,
} from '@/dashboard/modules/pendingReviews.js';

function makeViewModel(
  overrides: Partial<{
    identifier: string;
    mrNumber: number;
    displayTitle: string;
    projectPath: string;
    mrUrl: string;
    jobTypeLabel: string;
    triggerSourceLabel: string;
    createdAtRelative: string;
    confirmActionUrl: string;
    dismissActionUrl: string;
  }> = {},
) {
  return {
    identifier: 'pending-1',
    mrNumber: 42,
    displayTitle: 'MR !42 - Refactor X',
    projectPath: 'group/project',
    mrUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
    jobTypeLabel: 'Review',
    triggerSourceLabel: 'Webhook',
    createdAtRelative: 'il y a 2m',
    confirmActionUrl: '/api/pending-reviews/pending-1/confirm',
    dismissActionUrl: '/api/pending-reviews/pending-1',
    ...overrides,
  };
}

describe('buildPendingReviewsModel', () => {
  it('returns an empty model when the input is empty', () => {
    const model = buildPendingReviewsModel([]);

    expect(model.items).toHaveLength(0);
    expect(model.count).toBe(0);
    expect(model.isEmpty).toBe(true);
    expect(model.emptyMessage).toBe('Aucune review en attente de confirmation');
  });

  it('returns the items unchanged when present', () => {
    const item = makeViewModel();

    const model = buildPendingReviewsModel([item]);

    expect(model.items).toEqual([item]);
    expect(model.count).toBe(1);
    expect(model.isEmpty).toBe(false);
  });

  it('treats a missing array as empty (defensive)', () => {
    const model = buildPendingReviewsModel(undefined as unknown as never);

    expect(model.isEmpty).toBe(true);
  });
});

describe('renderPendingReviewsHtml', () => {
  it('renders the French empty-state when no pending reviews', () => {
    const html = renderPendingReviewsHtml(buildPendingReviewsModel([]));

    expect(html).toContain('Aucune review en attente de confirmation');
    expect(html).toContain('empty-state');
  });

  it('renders confirm and dismiss buttons with the pending id', () => {
    const item = makeViewModel({ identifier: 'pending-abc' });

    const html = renderPendingReviewsHtml(buildPendingReviewsModel([item]));

    expect(html).toContain('data-pending-id="pending-abc"');
    expect(html).toContain('btn-confirm-pending');
    expect(html).toContain('btn-dismiss-pending');
    expect(html).toContain('Confirmer');
    expect(html).toContain('Ignorer');
  });

  it('escapes HTML special characters in user-controlled fields', () => {
    const item = makeViewModel({ displayTitle: 'MR !42 - <script>alert(1)</script>' });

    const html = renderPendingReviewsHtml(buildPendingReviewsModel([item]));

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
