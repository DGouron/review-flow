import { describe, expect, it } from 'vitest';

import {
  fetchMergeRequestTokenUsage,
  renderMergeRequestTokenUsage,
} from '@/dashboard/modules/mergeRequestTokenUsage.js';

const t = (key: string, params?: Record<string, string | number>) =>
  params
    ? `${key}(${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')})`
    : key;

const session = {
  sessionId: '3334f6a3',
  jobType: 'followup' as const,
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

describe('renderMergeRequestTokenUsage', () => {
  it('shows each session with its kind, model, duration, context read from cache and cost', () => {
    const html = renderMergeRequestTokenUsage(viewModel, t);

    expect(html).toContain('tokenUsage.jobType.followup');
    expect(html).toContain('claude-opus-5-5');
    expect(html).toContain('4 min');
    expect(html).toContain('2.5m');
    expect(html).toContain('$1.55');
  });

  it('names the signals that say what to change', () => {
    const html = renderMergeRequestTokenUsage(viewModel, t);

    expect(html).toContain('tokenUsage.signal.cacheRead(percent=96)');
    expect(html).toContain('tokenUsage.signal.projectMedian(ratio=1.8)');
  });

  it('shows a dash where a session recorded no duration', () => {
    const html = renderMergeRequestTokenUsage(
      {
        ...viewModel,
        sessions: [{ ...session, durationMinutes: null, turns: null }],
        costVsProjectMedian: null,
      },
      t,
    );

    expect(html).toContain('—');
    expect(html).not.toContain('tokenUsage.signal.projectMedian');
  });

  it('escapes what it did not write', () => {
    const html = renderMergeRequestTokenUsage(
      { ...viewModel, sessions: [{ ...session, model: '<img src=x onerror=alert(1)>' }] },
      t,
    );

    expect(html).not.toContain('<img');
  });

  it('says when no session was recorded for the pull request', () => {
    const html = renderMergeRequestTokenUsage(
      {
        ...viewModel,
        isEmpty: true,
        sessions: [],
        cacheReadSharePercent: null,
        costVsProjectMedian: null,
      },
      t,
    );

    expect(html).toContain('tokenUsage.mergeRequest.empty');
    expect(html).not.toContain('<table');
  });
});

describe('a table that fits the PR sheet', () => {
  it('keeps five columns: kind, model, duration, context read from cache, cost', () => {
    const html = renderMergeRequestTokenUsage(viewModel, t);

    expect(html.match(/<th>/g)).toHaveLength(5);
    expect(html).not.toContain('tokenUsage.column.cacheWrite');
  });
});

describe('fetchMergeRequestTokenUsage', () => {
  it('asks for the sessions of one pull request of one project', async () => {
    const requested: string[] = [];
    const fetchImpl = async (url: string) => {
      requested.push(url);
      return new Response(JSON.stringify(viewModel));
    };

    await fetchMergeRequestTokenUsage(
      'Practic-IO/practivizio-app',
      2094,
      fetchImpl as typeof fetch,
    );

    expect(requested).toEqual([
      '/api/token-usage/merge-request?project=Practic-IO%2Fpractivizio-app&mrNumber=2094',
    ]);
  });
});
