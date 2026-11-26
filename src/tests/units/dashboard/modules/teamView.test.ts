import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import { buildTeamViewModel, renderTeamViewHtml } from '@/dashboard/modules/teamView.js';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const DAY = 86_400_000;

function level(value: number, trend = 'stable') {
  return { level: value, trend };
}

function developer(name: string, overrides: Record<string, unknown> = {}) {
  return {
    developerName: name,
    title: 'architect',
    overallLevel: 7,
    categoryLevels: {
      quality: level(8, 'improving'),
      responsiveness: level(2),
      codeVolume: level(3, 'declining'),
      iteration: level(6),
    },
    strengths: ['quality'],
    weaknesses: ['responsiveness'],
    topPriority: 'responsiveness',
    reviewCount: 45,
    metrics: {
      averageBlocking: 0.16,
      averageWarnings: 1,
      averageDuration: 600,
      totalFollowups: 3,
      averageAdditions: 1604.4,
      averageDeletions: 20,
      firstReviewQualityRate: 0.58,
    },
    insightDescriptions: [],
    ...overrides,
  };
}

function insights(overrides: Record<string, unknown> = {}) {
  return {
    isEmpty: false,
    developers: [developer('carol'), developer('dave', { reviewCount: 12 })],
    team: {
      developerCount: 2,
      totalReviewCount: 57,
      averageLevels: { quality: 8, responsiveness: 2, codeVolume: 3, iteration: 7 },
      strengths: ['quality'],
      weaknesses: ['responsiveness'],
      tips: ['Split large pull requests'],
    },
    aiInsights: {
      generatedAt: new Date(NOW - 59 * DAY).toISOString(),
      team: {
        summary: 'High throughput, many follow-ups.',
        strengths: ['Fast reviews'],
        weaknesses: ['Bus factor of 1'],
        recommendations: ['Cap pull requests at 400 lines'],
        dynamics: 'One reviewer carries most reviews.',
      },
      developers: [{ developerName: 'carol', title: 'Steady builder' }],
    },
    hasNewReviewsSinceAiGeneration: true,
    ...overrides,
  };
}

const queueRows = [
  { id: 'a', lane: 'fix', author: { username: 'carol' } },
  { id: 'b', lane: 'approve', author: { username: 'carol' } },
  { id: 'c', lane: 'dormant', author: { username: 'carol' } },
  { id: 'd', lane: 'approve', author: { username: 'dave' } },
];

describe('buildTeamViewModel', () => {
  it('links every member to what waits for them in the queue', () => {
    const model = buildTeamViewModel(insights(), queueRows, NOW);

    expect(model.members[0]).toMatchObject({
      name: 'carol',
      waiting: { fix: 1, approve: 1, dormant: 1 },
      firstLane: 'fix',
      firstPassRate: 58,
      blockingPerReview: 0.16,
      averageAdditions: 1604,
      priority: 'responsiveness',
    });
    expect(model.members[1]?.firstLane).toBe('approve');
  });

  it('turns category levels into meters with their trend', () => {
    const model = buildTeamViewModel(insights(), [], NOW);

    expect(model.members[0]?.levels).toEqual([
      { key: 'quality', level: 8, tone: 'ok', trend: 'improving' },
      { key: 'responsiveness', level: 2, tone: 'low', trend: 'stable' },
      { key: 'codeVolume', level: 3, tone: 'low', trend: 'declining' },
      { key: 'iteration', level: 6, tone: 'mid', trend: 'stable' },
    ]);
    expect(model.health.map((cell) => cell.tone)).toEqual(['ok', 'low', 'low', 'ok']);
  });

  it('says how old the AI analysis is and who it leaves out', () => {
    const model = buildTeamViewModel(insights(), [], NOW);

    expect(model.analysis).toMatchObject({
      isAi: true,
      ageDays: 59,
      missing: ['dave'],
      hasNewReviews: true,
    });
  });

  it('falls back to the computed team insights without an AI analysis', () => {
    const model = buildTeamViewModel(insights({ aiInsights: null }), [], NOW);

    expect(model.analysis?.isAi).toBe(false);
    expect(model.analysis?.recommendations).toEqual(['Split large pull requests']);
  });

  it('is empty without reviews', () => {
    expect(buildTeamViewModel({ isEmpty: true, developers: [] }, [], NOW).isEmpty).toBe(true);
  });
});

describe('renderTeamViewHtml', () => {
  afterEach(() => setLanguage('en'));

  it('renders member cards that filter the queue, with a separate link to the developer sheet', () => {
    const html = renderTeamViewHtml(buildTeamViewModel(insights(), queueRows, NOW), t);

    expect(html).toContain('data-action="filter-member" data-author="carol" data-lane="fix"');
    expect(html).toContain('data-action="open-developer" data-developer="carol"');
  });

  it('shows levels without any "/10" score', () => {
    const html = renderTeamViewHtml(buildTeamViewModel(insights(), queueRows, NOW), t);

    expect(html).not.toMatch(/\/\s*10/);
  });

  it('keeps regenerate and export at hand and flags a stale analysis in French', () => {
    setLanguage('fr');
    const html = renderTeamViewHtml(buildTeamViewModel(insights(), queueRows, NOW), t);

    expect(html).toContain('data-action="regenerate-analysis"');
    expect(html).toContain('data-action="export-report"');
    expect(html).toContain('il y a 2 mois');
    expect(html).toContain('dave n&#39;y figure pas');
    expect(html).toContain('Forces');
  });

  it('escapes AI text', () => {
    const data = insights();
    data.aiInsights.team.summary = '<img src=x onerror=alert(1)>';

    expect(renderTeamViewHtml(buildTeamViewModel(data, [], NOW), t)).not.toContain('<img');
  });

  it('invites to pick a project when there is nothing to show', () => {
    expect(
      renderTeamViewHtml(buildTeamViewModel({ isEmpty: true, developers: [] }, [], NOW), t),
    ).toContain('team-empty');
  });
});
