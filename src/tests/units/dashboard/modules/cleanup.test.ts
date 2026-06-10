import { describe, it, expect } from 'vitest';

import { renderCleanupSection } from '@/dashboard/modules/cleanup.js';

describe('renderCleanupSection', () => {
  it('returns an HTML string mentioning the retention days', () => {
    const html = renderCleanupSection(30);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('30');
  });

  it('handles a different retention value', () => {
    const html = renderCleanupSection(7);
    expect(html).toContain('7');
  });
});
