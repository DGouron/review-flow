import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import { buildReviewQueueModel } from '@/dashboard/modules/reviewQueue.js';
import {
  approvalUrlOf,
  formatIdleAge,
  renderReviewQueueHtml,
} from '@/dashboard/modules/reviewQueueView.js';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY).toISOString();
}

function trackedMr(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'github-org/app-21',
    mrNumber: 21,
    title: 'feat(queue): sort <by> actor',
    url: 'https://github.com/org/app/pull/21',
    project: 'org/app',
    platform: 'github',
    author: { username: 'carol', displayName: null },
    openThreads: 0,
    totalThreads: 2,
    totalWarnings: 0,
    createdAt: daysAgo(3),
    lastReviewAt: daysAgo(2),
    reviews: [{ type: 'review', verdict: 'ready', grade: 'B' }],
    ...overrides,
  };
}

function modelFor(input: Record<string, unknown>) {
  return buildReviewQueueModel({
    pendingFix: [],
    pendingApproval: [],
    activeJobs: [],
    projectAliases: ['org/app'],
    nowMs: NOW,
    activeLane: 'approve',
    authorFilter: null,
    ...input,
  });
}

describe('formatIdleAge', () => {
  afterEach(() => setLanguage('en'));

  it('reads recent activity in days and old activity in months', () => {
    setLanguage('fr');

    expect(formatIdleAge(0, t)).toBe("aujourd'hui");
    expect(formatIdleAge(1, t)).toBe('hier');
    expect(formatIdleAge(12, t)).toBe('il y a 12 j');
    expect(formatIdleAge(95, t)).toBe('inactive depuis 3 mois');
  });
});

describe('approvalUrlOf', () => {
  it('points a GitHub pull request to its files page, where approval happens', () => {
    expect(approvalUrlOf('https://github.com/org/app/pull/21', '#')).toBe(
      'https://github.com/org/app/pull/21/files',
    );
  });

  it('keeps a GitLab merge request url and drops unsafe urls', () => {
    expect(approvalUrlOf('https://gitlab.com/org/app/-/merge_requests/3', '!')).toBe(
      'https://gitlab.com/org/app/-/merge_requests/3',
    );
    expect(approvalUrlOf('javascript:alert(1)', '#')).toBe('#');
  });
});

describe('renderReviewQueueHtml', () => {
  afterEach(() => setLanguage('en'));

  it('renders one tab per actor with its count, as the only row of counters', () => {
    const html = renderReviewQueueHtml(modelFor({ pendingApproval: [trackedMr()] }), t);

    expect(html.match(/class="queue-tab( is-active)?"/g)).toHaveLength(4);
    expect(html).toContain('To approve<span class="count">1</span>');
    expect(html).toContain('by the author');
  });

  it('escapes the title and shows the grade instead of any score', () => {
    const html = renderReviewQueueHtml(modelFor({ pendingApproval: [trackedMr()] }), t);

    expect(html).toContain('Sort &lt;by&gt; actor');
    expect(html).toContain('>B</span>');
    expect(html).not.toMatch(/\/10/);
  });

  it('puts the approve action on the row, linked to the review page', () => {
    const html = renderReviewQueueHtml(modelFor({ pendingApproval: [trackedMr()] }), t);

    expect(html).toContain('href="https://github.com/org/app/pull/21/files"');
    expect(html).toContain('data-action="approve"');
  });

  it('offers the follow-up on rows waiting for the author', () => {
    const html = renderReviewQueueHtml(
      modelFor({ activeLane: 'fix', pendingFix: [trackedMr({ openThreads: 1 })] }),
      t,
    );

    expect(html).toContain('data-action="followup" data-mr-id="github-org/app-21"');
  });

  it('asks for a confirmation before nudging every dormant author', () => {
    const model = modelFor({
      activeLane: 'dormant',
      pendingApproval: [trackedMr({ createdAt: daysAgo(80), lastReviewAt: daysAgo(60) })],
    });

    expect(renderReviewQueueHtml(model, t)).toContain('Nudge the authors');
    expect(renderReviewQueueHtml(model, t, { armedNudge: 'all' })).toContain(
      'Confirm: nudge 1 pull request(s)',
    );
  });

  it('lists the authors as filter chips and marks the active one', () => {
    const html = renderReviewQueueHtml(
      modelFor({ pendingApproval: [trackedMr()], authorFilter: 'carol' }),
      t,
    );

    expect(html).toContain('data-author="carol" aria-pressed="true"');
    expect(html).toContain('data-author="" aria-pressed="false"');
  });

  it('keeps the thread synchronisation at hand above the rows', () => {
    const html = renderReviewQueueHtml(modelFor({ pendingApproval: [trackedMr()] }), t);

    expect(html).toContain('data-action="sync-threads"');
  });

  it('marks the selected row', () => {
    const html = renderReviewQueueHtml(modelFor({ pendingApproval: [trackedMr()] }), t, {
      selectedId: 'github-org/app-21',
    });

    expect(html).toContain('queue-row is-selected');
  });

  it('says when the lane is empty, or still loading', () => {
    expect(renderReviewQueueHtml(modelFor({}), t)).toContain('No pull request in this queue');
    expect(renderReviewQueueHtml(modelFor({}), t, { isLoading: true })).toContain(
      'Loading the queue',
    );
  });

  it('offers to cancel a running review from its row', () => {
    const html = renderReviewQueueHtml(
      modelFor({
        activeLane: 'review',
        activeJobs: [
          {
            id: 'github:org/app:9',
            mrNumber: 9,
            project: 'org/app',
            status: 'running',
            title: 'x',
          },
        ],
      }),
      t,
    );

    expect(html).toContain('data-action="cancel" data-job-id="github:org/app:9"');
  });
});
