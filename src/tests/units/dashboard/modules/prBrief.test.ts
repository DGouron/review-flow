import { afterEach, describe, expect, it, vi } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import {
  BRIEF_TIMEOUT_MS,
  briefToText,
  digDeeperQuestion,
  formatBriefSize,
  readBriefResponse,
  renderBriefHtml,
  requestBrief,
} from '@/dashboard/modules/prBrief.js';

function brief(overrides: Record<string, unknown> = {}) {
  return {
    mrNumber: 2029,
    headSha: 'abc123',
    generatedAt: '2026-11-26T10:00:00Z',
    what: 'Adds the scorm-package skill.',
    problem: 'The content team builds each package by hand.',
    risks: ['CI installs Python 3.12 <and> Pillow', 'Twenty skill files'],
    toCheck: ['Build example 57 and open the five pages'],
    size: { additions: 4131, deletions: 115, changedFiles: 53 },
    areas: ['ci', 'skills'],
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

describe('readBriefResponse', () => {
  it('accepts a brief that follows the contract', () => {
    expect(readBriefResponse(200, brief())).toEqual({ status: 'ready', brief: brief() });
  });

  it('turns an unknown pull request into a clear error', () => {
    expect(readBriefResponse(404, { error: 'unknown' })).toEqual({
      status: 'error',
      errorKey: 'brief.error.notTracked',
      detail: 'unknown',
    });
  });

  it('turns a failed generation into an error carrying the server message', () => {
    expect(readBriefResponse(502, { error: 'model down' })).toEqual({
      status: 'error',
      errorKey: 'brief.error.failed',
      detail: 'model down',
    });
  });

  it('rejects a malformed brief instead of rendering half of it', () => {
    expect(readBriefResponse(200, brief({ risks: 'not a list' })).status).toBe('error');
    expect(readBriefResponse(200, null).status).toBe('error');
  });
});

describe('requestBrief', () => {
  afterEach(() => vi.useRealTimers());

  it('posts the project path, the number and the refresh flag', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse(200, brief()));

    const outcome = await requestBrief(
      { projectPath: '/repo/app', mrNumber: 2029, refresh: true },
      fetchImplementation,
    );

    expect(outcome.status).toBe('ready');
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/mr-tracking/brief',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectPath: '/repo/app', mrNumber: 2029, refresh: true }),
      }),
    );
  });

  it('reports a network failure as an error', async () => {
    const outcome = await requestBrief(
      { projectPath: '/repo/app', mrNumber: 1, refresh: false },
      async () => {
        throw new Error('offline');
      },
    );

    expect(outcome).toEqual({ status: 'error', errorKey: 'brief.error.network', detail: null });
  });

  it('gives up after the generation budget and says so', async () => {
    vi.useFakeTimers();
    const neverAnswers = (_url: string, init: { signal: AbortSignal }) =>
      new Promise<{ status: number; json: () => Promise<unknown> }>((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });

    const pending = requestBrief(
      { projectPath: '/repo/app', mrNumber: 1, refresh: false },
      neverAnswers,
    );
    await vi.advanceTimersByTimeAsync(BRIEF_TIMEOUT_MS);

    expect(await pending).toEqual({
      status: 'error',
      errorKey: 'brief.error.timeout',
      detail: null,
    });
    expect(BRIEF_TIMEOUT_MS).toBeGreaterThan(60_000);
  });
});

describe('formatBriefSize', () => {
  it('reads additions, deletions and files in the dashboard language', () => {
    setLanguage('fr');
    expect(formatBriefSize(brief().size, t, 'fr')).toBe('+4 131 / −115 · 53 fichiers');
    setLanguage('en');
    expect(formatBriefSize(brief().size, t, 'en')).toBe('+4,131 / −115 · 53 files');
  });
});

describe('renderBriefHtml', () => {
  afterEach(() => setLanguage('en'));

  it('offers the big explain button at rest', () => {
    const html = renderBriefHtml({ status: 'idle' }, t, 'en');

    expect(html).toContain('data-action="explain"');
    expect(html).toContain('Explain this pull request');
  });

  it('shows a skeleton while Ember reads the pull request', () => {
    const html = renderBriefHtml({ status: 'loading' }, t, 'en');

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('brief-skeleton');
  });

  it('renders the five sections, escaped, with dig deeper, copy and regenerate', () => {
    setLanguage('fr');
    const html = renderBriefHtml({ status: 'ready', brief: brief() }, t, 'fr');

    for (const label of [
      "Ce qu'elle fait",
      'Problème résolu',
      'Zones à risque',
      'À vérifier à la main',
      'Taille',
    ]) {
      expect(html).toContain(label.replace("'", '&#39;'));
    }
    expect(html).toContain('CI installs Python 3.12 &lt;and&gt; Pillow');
    expect(html).toContain('data-action="brief-dig"');
    expect(html).toContain('data-action="brief-copy"');
    expect(html).toContain('data-action="brief-refresh"');
    expect(html).toContain('53 fichiers');
  });

  it('explains the failure and offers to try again', () => {
    const html = renderBriefHtml(
      { status: 'error', errorKey: 'brief.error.failed', detail: 'model down' },
      t,
      'en',
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('The brief could not be written');
    expect(html).toContain('model down');
    expect(html).toContain('data-action="explain"');
  });
});

describe('briefToText and digDeeperQuestion', () => {
  it('copies the brief as plain text', () => {
    const text = briefToText(brief(), t, 'en');

    expect(text).toContain('What it does\nAdds the scorm-package skill.');
    expect(text).toContain('- Twenty skill files');
  });

  it('asks Ember to dig into the risky parts', () => {
    expect(digDeeperQuestion(brief(), t)).toContain('Twenty skill files');
  });
});
