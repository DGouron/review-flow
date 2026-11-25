import { describe, expect, it } from 'vitest';

import { renderReviewTabs, renderReviewTokenUsage } from '@/dashboard/modules/reviewTokenUsage.js';

const t = (key: string, params?: Record<string, string | number>) =>
  params
    ? `${key}(${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')})`
    : key;

const session = {
  sessionId: '3334f6a3',
  model: 'claude-opus-5-5',
  recordedAt: '2026-11-25T13:48:20.000Z',
  durationMinutes: 4,
  turns: 21,
  inputTokens: 40,
  outputTokens: 7010,
  cacheReadTokens: 2_529_566,
  cacheWriteTokens: 113_443,
  costUsd: '$1.55',
};

const viewModel = {
  isEmpty: false,
  sessions: [session],
  total: { ...session, costUsd: '$1.55' },
  cacheReadSharePercent: 96,
  costVsProjectMedian: 1.8,
};

describe('renderReviewTabs', () => {
  it('offers the report and its token usage, the active one selected', () => {
    const html = renderReviewTabs('review-2094', 'usage', t);

    expect(html).toContain('data-review-tab="report"');
    expect(html).toContain('data-review-tab="usage"');
    expect(html).toMatch(/data-review-tab="usage"[^>]*aria-selected="true"/);
    expect(html).toMatch(/data-review-tab="report"[^>]*aria-selected="false"/);
  });
});

describe('renderReviewTokenUsage', () => {
  it('shows each session with its model, duration, turns, tokens and cost', () => {
    const html = renderReviewTokenUsage(viewModel, t);

    expect(html).toContain('claude-opus-5-5');
    expect(html).toContain('4 min');
    expect(html).toContain('21');
    expect(html).toContain('2.5m');
    expect(html).toContain('113.4k');
    expect(html).toContain('7.0k');
    expect(html).toContain('$1.55');
  });

  it('names the signals that say what to change', () => {
    const html = renderReviewTokenUsage(viewModel, t);

    expect(html).toContain('reviewUsage.signal.cacheRead(percent=96)');
    expect(html).toContain('reviewUsage.signal.projectMedian(ratio=1.8)');
  });

  it('shows a dash where a session recorded no duration or turns', () => {
    const html = renderReviewTokenUsage(
      {
        ...viewModel,
        sessions: [{ ...session, durationMinutes: null, turns: null }],
        costVsProjectMedian: null,
      },
      t,
    );

    expect(html).toContain('—');
    expect(html).not.toContain('reviewUsage.signal.projectMedian');
  });

  it('escapes what it did not write', () => {
    const html = renderReviewTokenUsage(
      { ...viewModel, sessions: [{ ...session, model: '<img src=x onerror=alert(1)>' }] },
      t,
    );

    expect(html).not.toContain('<img');
  });

  it('says when no session was recorded for the report', () => {
    const html = renderReviewTokenUsage(
      {
        ...viewModel,
        isEmpty: true,
        sessions: [],
        cacheReadSharePercent: null,
        costVsProjectMedian: null,
      },
      t,
    );

    expect(html).toContain('reviewUsage.empty');
    expect(html).not.toContain('<table');
  });
});
