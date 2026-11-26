import { afterEach, describe, expect, it, vi } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import {
  normalizeView,
  readActiveView,
  renderViewNavHtml,
  writeActiveView,
} from '@/dashboard/modules/viewNavigation.js';

describe('normalizeView', () => {
  it('keeps a known view and falls back to the review queue', () => {
    expect(normalizeView('team')).toBe('team');
    expect(normalizeView('stats')).toBe('queue');
    expect(normalizeView(null)).toBe('queue');
  });
});

describe('renderViewNavHtml', () => {
  afterEach(() => setLanguage('en'));

  it('renders the three views, marks the current one and shows non-zero badges', () => {
    setLanguage('fr');
    const html = renderViewNavHtml('worktrees', { queue: 11, team: 0, worktrees: 2 }, t);

    expect(html).toContain('File de review<span class="count">11</span>');
    expect(html).toContain('Équipe</button>');
    expect(html).toContain('data-view="worktrees" aria-current="page"');
  });

  it('offers the Monitoring view last, without a badge', () => {
    const html = renderViewNavHtml('monitoring', { queue: 1 }, t);

    expect(normalizeView('monitoring')).toBe('monitoring');
    expect(html.endsWith('data-view="monitoring" aria-current="page">Monitoring</button>')).toBe(
      true,
    );
  });
});

describe('active view storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('remembers the chosen view', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });

    writeActiveView('team');

    expect(readActiveView()).toBe('team');
  });

  it('falls back to the queue when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });

    expect(() => writeActiveView('team')).not.toThrow();
    expect(readActiveView()).toBe('queue');
  });
});
