import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import {
  buildPrDetailModel,
  renderPanelTabsHtml,
  renderPrDetailHtml,
} from '@/dashboard/modules/prDetailPanel.js';
import { buildReviewQueueModel } from '@/dashboard/modules/reviewQueue.js';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function trackedMr(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'github-org/app-30',
    mrNumber: 30,
    title: 'fix: keep the <drawer> closed',
    url: 'https://github.com/org/app/pull/30',
    project: 'org/app',
    platform: 'github',
    sourceBranch: 'fix/drawer',
    targetBranch: 'master',
    assignment: {
      username: 'requester',
      displayName: 'Req',
      assignedAt: new Date(NOW - DAY).toISOString(),
    },
    author: { username: 'carol', displayName: null },
    openThreads: 1,
    totalThreads: 4,
    totalBlocking: 2,
    totalWarnings: 3,
    totalReviews: 1,
    totalFollowups: 2,
    autoFollowup: true,
    createdAt: new Date(NOW - 3 * DAY).toISOString(),
    lastPushAt: new Date(NOW - DAY).toISOString(),
    reviews: [{ type: 'review', verdict: 'changes', grade: 'C' }],
    ...overrides,
  };
}

function rowFor(mergeRequest: Record<string, unknown>, lane: 'approve' | 'fix') {
  const model = buildReviewQueueModel({
    pendingFix: lane === 'fix' ? [mergeRequest] : [],
    pendingApproval: lane === 'approve' ? [mergeRequest] : [],
    activeJobs: [],
    projectAliases: ['org/app'],
    nowMs: NOW,
    activeLane: lane,
    authorFilter: null,
  });
  return model.rows[0];
}

describe('buildPrDetailModel', () => {
  it('summarises verdict, counts, author and the next step for the right actor', () => {
    const mergeRequest = trackedMr();
    const model = buildPrDetailModel(rowFor(mergeRequest, 'fix'), mergeRequest);

    expect(model).toMatchObject({
      id: 'github-org/app-30',
      grade: 'C',
      verdict: 'changes',
      reviews: 1,
      followups: 2,
      blocking: 2,
      warnings: 3,
      openThreads: 1,
      totalThreads: 4,
      nextKey: 'panel.next.fix',
      requestedBy: 'Req',
      branches: { source: 'fix/drawer', target: 'master' },
      autoFollowup: true,
    });
    expect(model.author?.username).toBe('carol');
  });

  it('asks you to settle warnings before approving', () => {
    const mergeRequest = trackedMr({ totalWarnings: 1, openThreads: 0 });

    expect(buildPrDetailModel(rowFor(mergeRequest, 'approve'), mergeRequest).nextKey).toBe(
      'panel.next.approveWarnings',
    );
  });

  it('tells the author to run the follow-up when it is not automatic', () => {
    const mergeRequest = trackedMr({ autoFollowup: false });

    expect(buildPrDetailModel(rowFor(mergeRequest, 'fix'), mergeRequest).nextKey).toBe(
      'panel.next.fixManual',
    );
  });

  it('describes a running job that is not tracked yet', () => {
    const model = buildPrDetailModel(
      {
        id: 'github:org/app:9',
        lane: 'review',
        mrNumber: 9,
        prefix: '#',
        subject: 'Fix',
        url: '',
        author: null,
        idleDays: 0,
        outcome: { verdict: null, grade: null },
        threads: { open: 0, total: 0, tone: 'none' },
        jobId: 'github:org/app:9',
      },
      null,
    );

    expect(model.nextKey).toBe('panel.next.review');
    expect(model.isTracked).toBe(false);
  });
});

describe('renderPrDetailHtml', () => {
  afterEach(() => setLanguage('en'));

  it('renders the verdict card with the grade, never a score out of ten', () => {
    const mergeRequest = trackedMr();
    const html = renderPrDetailHtml(
      buildPrDetailModel(rowFor(mergeRequest, 'fix'), mergeRequest),
      t,
    );

    expect(html).toContain('>C</span>');
    expect(html).toContain('To rework');
    expect(html).toContain('1 review(s) · 2 follow-up(s)');
    expect(html).not.toMatch(/\/10/);
  });

  it('escapes the subject and keeps the actions of a tracked pull request', () => {
    setLanguage('fr');
    const mergeRequest = trackedMr();
    const html = renderPrDetailHtml(
      buildPrDetailModel(rowFor(mergeRequest, 'fix'), mergeRequest),
      t,
    );

    expect(html).toContain('Keep the &lt;drawer&gt; closed');
    expect(html).toContain('data-action="followup"');
    expect(html).toContain('data-action="toggle-auto-followup"');
    expect(html).toContain('data-action="mark-merged"');
    expect(html).toContain('data-action="open-history"');
    expect(html).toContain('Review demandée par Req');
  });

  it('shows an empty state without a selection', () => {
    expect(renderPrDetailHtml(null, t)).toContain('Select a pull request');
  });
});

describe('renderPanelTabsHtml', () => {
  it('names the selected pull request on its tab and disables it without one', () => {
    expect(
      renderPanelTabsHtml({ activeTab: 'pr', selection: { prefix: '#', mrNumber: 30 } }, t),
    ).toContain('PR #30');
    expect(renderPanelTabsHtml({ activeTab: 'ember', selection: null }, t)).toContain('disabled');
  });
});
