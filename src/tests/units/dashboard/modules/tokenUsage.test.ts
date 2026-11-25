import { describe, expect, it } from 'vitest';

import {
  formatTokenCount,
  renderTokenUsageTile,
  startOfCurrentMonthUtc,
} from '@/dashboard/modules/tokenUsage.js';

const translate = (key: string, params?: Record<string, string | number>) =>
  params
    ? `${key}(${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')})`
    : key;

const nonEmptyViewModel = {
  totalCostUsd: '$1.23',
  recordCount: 4,
  totalTokens: 1500,
  isEmpty: false,
  jobTypes: [
    { name: 'review' as const, count: 3, costUsd: '$1.00' },
    { name: 'followup' as const, count: 1, costUsd: '$0.23' },
  ],
  medianMergeRequestCostUsd: '$0.62',
  models: [
    { name: 'claude-opus-4-7', count: 1, costUsd: '$0.93', costShare: '76%' },
    { name: 'claude-sonnet-4-6', count: 3, costUsd: '$0.30', costShare: '24%' },
  ],
};

const emptyViewModel = {
  totalCostUsd: '$0.00',
  recordCount: 0,
  totalTokens: 0,
  isEmpty: true,
  models: [],
};

describe('formatTokenCount', () => {
  it('returns the raw count under 1000', () => {
    expect(formatTokenCount(500)).toBe('500');
  });

  it('formats thousands with k suffix', () => {
    expect(formatTokenCount(1500)).toBe('1.5k');
  });

  it('formats millions with m suffix', () => {
    expect(formatTokenCount(2_500_000)).toBe('2.5m');
  });

  it('formats 0 as 0', () => {
    expect(formatTokenCount(0)).toBe('0');
  });
});

describe('renderTokenUsageTile', () => {
  describe('with a populated summary', () => {
    it('renders the total cost prominently', () => {
      const html = renderTokenUsageTile(nonEmptyViewModel);
      expect(html).toContain('$1.23');
    });

    it('renders the record count and formatted token total', () => {
      const html = renderTokenUsageTile(nonEmptyViewModel);
      expect(html).toContain('4');
      expect(html).toContain('1.5k');
    });

    it('renders each model with its share and cost', () => {
      const html = renderTokenUsageTile(nonEmptyViewModel);
      expect(html).toContain('claude-opus-4-7');
      expect(html).toContain('76%');
      expect(html).toContain('$0.93');
      expect(html).toContain('claude-sonnet-4-6');
      expect(html).toContain('24%');
    });

    it('escapes potentially unsafe model names', () => {
      const malicious = {
        ...nonEmptyViewModel,
        models: [
          {
            name: '<script>alert("x")</script>',
            count: 1,
            costUsd: '$0.10',
            costShare: '100%',
          },
        ],
      };
      const html = renderTokenUsageTile(malicious);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('with an empty summary', () => {
    it('shows a friendly empty-state message', () => {
      const html = renderTokenUsageTile(emptyViewModel);
      expect(html.toLowerCase()).toContain('no review');
    });

    it('does not render any model breakdown rows', () => {
      const html = renderTokenUsageTile(emptyViewModel);
      expect(html).not.toContain('claude-');
    });
  });
});

describe('the monthly token usage of Economics', () => {
  it('starts the month on its first day, in UTC like the monthly budget', () => {
    expect(startOfCurrentMonthUtc(new Date('2026-11-25T15:00:00.000Z'))).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });

  it('counts sessions, then splits reviews from follow-ups', () => {
    const html = renderTokenUsageTile(nonEmptyViewModel, translate);

    expect(html).toContain('tokenUsage.sessions(count=4)');
    expect(html).toContain('tokenUsage.jobType.review');
    expect(html).toContain('$1.00');
    expect(html).toContain('tokenUsage.jobType.followup');
    expect(html).toContain('$0.23');
  });

  it('names the cost of the median pull request when there is one', () => {
    expect(renderTokenUsageTile(nonEmptyViewModel, translate)).toContain(
      'tokenUsage.medianMergeRequest',
    );
    expect(
      renderTokenUsageTile({ ...nonEmptyViewModel, medianMergeRequestCostUsd: null }, translate),
    ).not.toContain('tokenUsage.medianMergeRequest');
  });
});
