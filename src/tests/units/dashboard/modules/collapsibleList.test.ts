import { describe, it, expect } from 'vitest';

import { renderCollapsibleList } from '@/dashboard/modules/collapsibleList.js';

const translate = (key: string) => key;

describe('renderCollapsibleList', () => {
  it('returns an HTML string containing all rendered items when under the visible threshold', () => {
    const html = renderCollapsibleList(
      ['<div>item-a</div>', '<div>item-b</div>'],
      'my-list',
      translate,
      5,
    );
    expect(html).toContain('item-a');
    expect(html).toContain('item-b');
  });

  it('uses the list identifier in the toggle button when items overflow the visible threshold', () => {
    const items = Array.from({ length: 7 }, (_, index) => `<div>item-${index}</div>`);
    const html = renderCollapsibleList(items, 'unique-list-id', translate, 3);
    expect(html).toContain('unique-list-id');
    expect(html).toContain('collapsible-toggle');
  });

  it('returns an empty-ish string when the list has no items', () => {
    const html = renderCollapsibleList([], 'empty', translate, 5);
    expect(typeof html).toBe('string');
  });
});
