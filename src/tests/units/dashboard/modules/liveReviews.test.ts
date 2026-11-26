import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import {
  buildLiveReviewsModel,
  formatElapsed,
  renderLiveReviewsHtml,
} from '@/dashboard/modules/liveReviews.js';

const NOW = Date.parse('2026-11-26T12:00:00Z');

function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'github:org/app:1526',
    mrNumber: 1526,
    project: 'org/app',
    mrUrl: 'https://github.com/org/app/pull/1526',
    status: 'running',
    jobType: 'followup',
    title: 'feat(livekit): record the session from the exercise start',
    startedAt: new Date(NOW - 71_000).toISOString(),
    progress: {
      agents: [
        { name: 'context', displayName: 'Context', status: 'completed' },
        { name: 'verify', displayName: 'Verification', status: 'running' },
        { name: 'report', displayName: 'Report', status: 'pending' },
      ],
    },
    ...overrides,
  };
}

describe('formatElapsed', () => {
  it('reads seconds, minutes and hours', () => {
    expect(formatElapsed(42_000)).toBe('42 s');
    expect(formatElapsed(71_000)).toBe('1 min 11 s');
    expect(formatElapsed(3_720_000)).toBe('1 h 02 min');
    expect(formatElapsed(-5)).toBe('0 s');
  });
});

describe('buildLiveReviewsModel', () => {
  it('builds one banner per active job, running ones first', () => {
    const model = buildLiveReviewsModel(
      [job({ id: 'queued', status: 'queued', startedAt: undefined }), job()],
      NOW,
    );

    expect(model.map((banner) => banner.jobId)).toEqual(['github:org/app:1526', 'queued']);
    expect(model[0]).toMatchObject({
      mrNumber: 1526,
      prefix: '#',
      subject: 'Record the session from the exercise start',
      kindKey: 'live.followup',
      elapsed: '1 min 11 s',
    });
    expect(model[1]?.kindKey).toBe('live.queued');
  });

  it('turns agents into steps: done, now and still to come', () => {
    const [banner] = buildLiveReviewsModel([job()], NOW);

    expect(banner?.steps).toEqual([
      { label: 'Context', state: 'done' },
      { label: 'Verification', state: 'now' },
      { label: 'Report', state: 'pending' },
    ]);
  });
});

describe('renderLiveReviewsHtml', () => {
  afterEach(() => setLanguage('en'));

  it('renders the step chips, elapsed time and a cancel action', () => {
    setLanguage('fr');
    const html = renderLiveReviewsHtml(buildLiveReviewsModel([job()], NOW), t);

    expect(html).toContain('Claude vérifie les correctifs');
    expect(html).toContain('step is-now');
    expect(html).toContain('1 min 11 s');
    expect(html).toContain('data-action="cancel" data-job-id="github:org/app:1526"');
  });

  it('renders nothing when no review runs', () => {
    expect(renderLiveReviewsHtml([], t)).toBe('');
  });
});
