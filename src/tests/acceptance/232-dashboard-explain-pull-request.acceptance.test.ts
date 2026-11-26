/**
 * SPEC-232 — "Explain" a pull request from the dashboard.
 *
 * Outer-loop acceptance test. The brief endpoint (POST /api/mr-tracking/brief) is
 * delivered by another feature; it is simulated here with a fetch stub that
 * follows the shared contract.
 *
 * Source of truth: docs/specs/232-dashboard-explain-pull-request.md.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import { digDeeperQuestion, renderBriefHtml, requestBrief } from '@/dashboard/modules/prBrief.js';
import { buildReviewQueueModel } from '@/dashboard/modules/reviewQueue.js';
import { renderReviewQueueHtml } from '@/dashboard/modules/reviewQueueView.js';

const contractBrief = {
  mrNumber: 2029,
  headSha: 'abc123',
  generatedAt: '2026-11-26T10:00:00Z',
  what: 'Ajoute le skill scorm-package.',
  problem: "L'équipe contenu monte chaque paquet à la main.",
  risks: ['CI : installe Python 3.12 et Pillow'],
  toCheck: ["Construire l'exemple 57"],
  size: { additions: 4131, deletions: 115, changedFiles: 53 },
  areas: ['ci'],
};

function briefEndpoint(status: number, body: unknown) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImplementation = async (url: string, init: { body?: string }) => {
    calls.push({ url, body: JSON.parse(init.body ?? '{}') });
    return { status, json: async () => body };
  };
  return { calls, fetchImplementation };
}

describe('SPEC-232 — explain a pull request', () => {
  afterEach(() => setLanguage('en'));

  it('every queue row carries an Explain button', () => {
    const model = buildReviewQueueModel({
      pendingFix: [],
      pendingApproval: [
        {
          id: 'github-acme/app-2029',
          mrNumber: 2029,
          title: 'feat(scorm-package): build packages',
          project: 'acme/app',
          platform: 'github',
          createdAt: '2026-11-25T10:00:00Z',
          reviews: [],
        },
      ],
      activeJobs: [],
      projectAliases: ['acme/app'],
      nowMs: Date.parse('2026-11-26T12:00:00Z'),
      activeLane: 'approve',
      authorFilter: null,
    });

    expect(renderReviewQueueHtml(model, t)).toContain(
      'data-action="explain" data-mr-id="github-acme/app-2029"',
    );
  });

  it('at rest, the panel offers the big Explain button', () => {
    setLanguage('fr');
    expect(renderBriefHtml({ status: 'idle' }, t, 'fr')).toContain('Expliquer cette PR');
  });

  it('while Ember writes, the panel shows a loading state', () => {
    expect(renderBriefHtml({ status: 'loading' }, t, 'en')).toContain('aria-busy="true"');
  });

  it('when ready, the brief shows what it does, the problem, the risks, what to check and the size', async () => {
    setLanguage('fr');
    const endpoint = briefEndpoint(200, contractBrief);

    const state = await requestBrief(
      { projectPath: '/repo/app', mrNumber: 2029, refresh: false },
      endpoint.fetchImplementation,
    );
    const html = renderBriefHtml(state, t, 'fr');

    expect(endpoint.calls[0]).toEqual({
      url: '/api/mr-tracking/brief',
      body: { projectPath: '/repo/app', mrNumber: 2029, refresh: false },
    });
    expect(html).toContain('Ajoute le skill scorm-package.');
    expect(html).toContain('Zones à risque');
    expect(html).toContain('À vérifier à la main');
    expect(html).toContain('+4 131 / −115 · 53 fichiers');
    expect(html).toContain('Creuser avec Ember');
  });

  it('regenerating asks the server to refresh the cached brief', async () => {
    const endpoint = briefEndpoint(200, contractBrief);

    await requestBrief(
      { projectPath: '/repo/app', mrNumber: 2029, refresh: true },
      endpoint.fetchImplementation,
    );

    expect(endpoint.calls[0]?.body).toEqual({
      projectPath: '/repo/app',
      mrNumber: 2029,
      refresh: true,
    });
  });

  it('an unknown pull request or a failed generation ends in an error state with a retry', async () => {
    const unknown = await requestBrief(
      { projectPath: '/repo/app', mrNumber: 1, refresh: false },
      briefEndpoint(404, { error: 'not tracked' }).fetchImplementation,
    );
    const failed = await requestBrief(
      { projectPath: '/repo/app', mrNumber: 1, refresh: false },
      briefEndpoint(502, { error: 'generation failed' }).fetchImplementation,
    );

    expect(renderBriefHtml(unknown, t, 'en')).toContain(
      'ReviewFlow does not track this pull request.',
    );
    expect(renderBriefHtml(failed, t, 'en')).toContain('The brief could not be written.');
    expect(renderBriefHtml(failed, t, 'en')).toContain('data-action="explain"');
  });

  it('"Dig deeper with Ember" starts from the risky parts of the brief', () => {
    expect(digDeeperQuestion(contractBrief, t)).toContain('CI : installe Python 3.12 et Pillow');
  });
});
