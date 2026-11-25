import { describe, it, expect } from 'vitest';

import { renderMrSheetContent } from '@/dashboard/modules/mrSheet.js';

const translate = (key: string) => key;

const mr = {
  id: 'gitlab-group/project-42',
  title: 'Fix the thing',
  number: 42,
  platform: 'gitlab',
  state: 'pending-review',
  author: 'alice',
  url: 'https://example.com/mr/42',
  openThreads: 0,
  reviewCount: 1,
  lastReviewScore: 8,
  history: [],
};

describe('renderMrSheetContent', () => {
  it('returns an HTML string containing the merge request title', () => {
    const html = renderMrSheetContent(mr, translate, 'review');
    expect(typeof html).toBe('string');
    expect(html).toContain('Fix the thing');
  });

  it('escapes the title to prevent XSS', () => {
    const malicious = { ...mr, title: '<script>alert("x")</script>' };
    const html = renderMrSheetContent(malicious, translate, 'review');
    expect(html).not.toContain('<script>alert');
  });

  it('keeps a place for the token usage of the pull request, filled once it is fetched', () => {
    const html = renderMrSheetContent(mr, translate, 'review');

    expect(html).toContain('sheet.tokenUsage');
    expect(html).toContain('id="sheet-token-usage"');
  });

  it('shows the token usage right under the key figures, before the charts', () => {
    const html = renderMrSheetContent(mr, translate, 'review');

    expect(html.indexOf('id="sheet-token-usage"')).toBeLessThan(html.indexOf('sheet-score-canvas'));
  });
});
