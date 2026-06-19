import { describe, it, expect } from 'vitest';

import { renderKeyInsightsHtml } from '@/dashboard/modules/keyInsights.js';

describe('renderKeyInsightsHtml', () => {
  it('renders one card per insight with its title and body', () => {
    const html = renderKeyInsightsHtml({
      cards: [
        { title: 'Review volume is up', body: '12 recent reviews vs 6 before (+100%)' },
        { title: 'Logic is the most common finding', body: '12 findings across all reviews' },
      ],
      isEmpty: false,
      emptyMessage: 'Aucun insight disponible pour le moment',
    });

    expect(html).toContain('Review volume is up');
    expect(html).toContain('12 recent reviews vs 6 before (+100%)');
    expect(html).toContain('Logic is the most common finding');
    expect(html).toContain('12 findings across all reviews');
  });

  it('renders the empty-state message when isEmpty is true', () => {
    const html = renderKeyInsightsHtml({
      cards: [],
      isEmpty: true,
      emptyMessage: 'Aucun insight disponible pour le moment',
    });

    expect(html).toContain('Aucun insight disponible pour le moment');
  });

  it('escapes card text to guard against malformed server payloads', () => {
    const html = renderKeyInsightsHtml({
      cards: [{ title: '<script>alert(1)</script>', body: 'safe' }],
      isEmpty: false,
      emptyMessage: 'Aucun insight disponible pour le moment',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('falls back to an empty state when the view model is missing', () => {
    const html = renderKeyInsightsHtml(null);

    expect(html).toContain('Aucun insight disponible pour le moment');
  });
});
