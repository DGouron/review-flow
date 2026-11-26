/**
 * Dashboard module — Team view (SPEC-231).
 *
 * Team health, one card per member linked to what waits for them in the
 * queue, and the AI analysis with its age.
 */

import { escapeHtml } from './html.js';
import { icon } from './icons.js';

const CATEGORIES = ['quality', 'responsiveness', 'codeVolume', 'iteration'];
const LANE_PRIORITY = ['fix', 'approve', 'dormant', 'review'];
const DAY_MS = 86_400_000;
const TREND_ARROW = { improving: '↑', stable: '→', declining: '↓' };

/** @typedef {(key: string, params?: Record<string, string | number>) => string} Translate */

function toneOf(level) {
  if (level >= 7) return 'ok';
  if (level >= 4) return 'mid';
  return 'low';
}

function levelOf(categoryLevel) {
  if (typeof categoryLevel === 'number') return { level: categoryLevel, trend: 'stable' };
  return { level: Number(categoryLevel?.level) || 0, trend: categoryLevel?.trend ?? 'stable' };
}

function waitingOf(name, queueRows) {
  const own = queueRows.filter((row) => row.author?.username === name);
  const count = (lane) => own.filter((row) => row.lane === lane).length;
  const waiting = { fix: count('fix'), approve: count('approve'), dormant: count('dormant') };
  const firstLane = LANE_PRIORITY.find((lane) => count(lane) > 0) ?? 'approve';
  return { waiting, firstLane };
}

function memberOf(developer, queueRows, aiDevelopers) {
  const metrics = developer.metrics ?? {};
  const aiDeveloper = aiDevelopers.find(
    (candidate) => candidate.developerName === developer.developerName,
  );
  return {
    name: developer.developerName,
    titleKey: `title.${developer.title}`,
    aiTitle: aiDeveloper?.title ?? null,
    reviewCount: developer.reviewCount ?? 0,
    ...waitingOf(developer.developerName, queueRows),
    firstPassRate: Math.round((Number(metrics.firstReviewQualityRate) || 0) * 100),
    blockingPerReview: Math.round((Number(metrics.averageBlocking) || 0) * 100) / 100,
    averageAdditions: Math.round(Number(metrics.averageAdditions) || 0),
    priority: developer.topPriority ?? null,
    levels: CATEGORIES.map((key) => {
      const { level, trend } = levelOf(developer.categoryLevels?.[key]);
      return { key, level, tone: toneOf(level), trend };
    }),
  };
}

function analysisOf(insightsData, nowMs) {
  const ai = insightsData.aiInsights?.team ? insightsData.aiInsights : null;
  if (!ai) {
    const team = insightsData.team ?? {};
    return {
      isAi: false,
      generatedAt: null,
      ageDays: null,
      missing: [],
      hasNewReviews: false,
      summary: null,
      strengths: team.strengths ?? [],
      weaknesses: team.weaknesses ?? [],
      recommendations: team.tips ?? [],
      dynamics: null,
    };
  }
  const covered = new Set((ai.developers ?? []).map((developer) => developer.developerName));
  const generatedAtMs = Date.parse(ai.generatedAt);
  return {
    isAi: true,
    generatedAt: ai.generatedAt,
    ageDays: Number.isNaN(generatedAtMs)
      ? null
      : Math.max(0, Math.floor((nowMs - generatedAtMs) / DAY_MS)),
    missing: insightsData.developers
      .map((developer) => developer.developerName)
      .filter((name) => !covered.has(name)),
    hasNewReviews: insightsData.hasNewReviewsSinceAiGeneration === true,
    summary: ai.team.summary ?? null,
    strengths: ai.team.strengths ?? [],
    weaknesses: ai.team.weaknesses ?? [],
    recommendations: ai.team.recommendations ?? [],
    dynamics: ai.team.dynamics ?? null,
  };
}

/**
 * @param {Record<string, any>} insightsData payload of GET /api/insights
 * @param {Array<{ lane: string, author: { username: string } | null }>} queueRows every row of the review queue
 * @param {number} nowMs
 */
export function buildTeamViewModel(insightsData, queueRows, nowMs) {
  if (!insightsData || insightsData.isEmpty || !Array.isArray(insightsData.developers)) {
    return {
      isEmpty: true,
      developerCount: 0,
      totalReviewCount: 0,
      health: [],
      members: [],
      analysis: null,
    };
  }
  const team = insightsData.team ?? {};
  const aiDevelopers = insightsData.aiInsights?.developers ?? [];
  return {
    isEmpty: false,
    developerCount: team.developerCount ?? insightsData.developers.length,
    totalReviewCount: team.totalReviewCount ?? 0,
    health: CATEGORIES.map((key) => {
      const level = Math.round(Number(team.averageLevels?.[key]) || 0);
      return { key, level, tone: toneOf(level) };
    }),
    members: insightsData.developers.map((developer) =>
      memberOf(developer, queueRows, aiDevelopers),
    ),
    analysis: analysisOf(insightsData, nowMs),
  };
}

function renderMeter(level, tone) {
  const width = Math.max(0, Math.min(10, level)) * 10;
  return `<div class="meter" aria-hidden="true"><i class="meter-${tone}" style="width: ${width}%"></i></div>`;
}

function renderHealth(model, t) {
  const cells = model.health
    .map(
      (cell) =>
        `<div class="metric-cell"><div class="metric-label">${escapeHtml(t(`category.${cell.key}`))}</div><div class="metric-value mono">${cell.level}</div>${renderMeter(cell.level, cell.tone)}</div>`,
    )
    .join('');
  return `<section class="card metric-grid metric-grid-4" aria-label="${escapeHtml(t('team.view.health'))}">${cells}</section>`;
}

function renderMemberCard(member, t) {
  const initials = member.name.slice(0, 2).toUpperCase();
  const title = member.aiTitle ?? t(member.titleKey);
  const chip = (count, key) =>
    `<span class="chip${count > 0 && key !== 'approve' ? ' chip-warn' : ''}">${escapeHtml(t(`team.member.${key}`, { count }))}</span>`;
  const cell = (key, value) =>
    `<div class="member-cell"><div class="metric-label">${escapeHtml(t(`team.member.${key}`))}</div><div class="member-cell-value mono">${escapeHtml(String(value))}</div></div>`;
  const levels = member.levels
    .map(
      (level) =>
        `<span>${escapeHtml(t(`category.${level.key}`))}</span>${renderMeter(level.level, level.tone)}<span class="trend trend-${escapeHtml(level.trend)}" title="${escapeHtml(t(`team.trend.${level.trend}`))}">${TREND_ARROW[level.trend] ?? '→'}</span>`,
    )
    .join('');
  const priority = member.priority
    ? `<div class="member-priority">${escapeHtml(t('team.member.priority', { category: t(`category.${member.priority}`).toLowerCase() }))}</div>`
    : '';
  return `<article class="member-card">
  <button type="button" class="member-main" data-action="filter-member" data-author="${escapeHtml(member.name)}" data-lane="${member.firstLane}" title="${escapeHtml(t('team.member.showQueue'))}">
    <span class="member-head"><span class="avatar avatar-xl" aria-hidden="true">${escapeHtml(initials)}</span><span><span class="member-name">${escapeHtml(member.name)}</span><span class="member-sub">${escapeHtml(title)} · ${escapeHtml(t('team.member.reviewCount', { count: member.reviewCount }))}</span></span></span>
    <span class="member-waiting">${chip(member.waiting.fix, 'fix')}${chip(member.waiting.approve, 'approve')}${chip(member.waiting.dormant, 'dormant')}</span>
    <span class="member-grid">${cell('firstPass', `${member.firstPassRate} %`)}${cell('blocking', member.blockingPerReview)}${cell('size', `+${member.averageAdditions}`)}${cell('reviews', member.reviewCount)}</span>
    <span class="member-levels">${levels}</span>
    ${priority}
  </button>
  <button type="button" class="btn btn-ghost member-sheet" data-action="open-developer" data-developer="${escapeHtml(member.name)}">${icon('user-round')}${escapeHtml(t('team.member.sheet'))}</button>
</article>`;
}

function renderAnalysisNotice(analysis, t) {
  if (!analysis.isAi) {
    return `<div class="notice notice-row"><span class="notice-text">${escapeHtml(t('team.analysis.none'))}</span><button type="button" class="btn ai-generate-btn" data-action="regenerate-analysis">${escapeHtml(t('team.analysis.generate'))}</button></div>`;
  }
  const parts = [];
  if (analysis.generatedAt) {
    const date = new Date(analysis.generatedAt).toLocaleDateString();
    const age =
      analysis.ageDays === null
        ? ''
        : analysis.ageDays <= 30
          ? t('queue.age.days', { count: analysis.ageDays })
          : t('team.analysis.months', { count: Math.round(analysis.ageDays / 30) });
    parts.push(t('team.analysis.generated', { date, age }));
  }
  if (analysis.missing.length > 0)
    parts.push(t('team.analysis.missing', { names: analysis.missing.join(', ') }));
  if (analysis.hasNewReviews) parts.push(t('team.analysis.newData'));
  return `<div class="notice notice-row"><span class="notice-text">${escapeHtml(parts.join(' '))}</span><button type="button" class="btn ai-generate-btn" data-action="regenerate-analysis">${escapeHtml(t('team.analysis.regenerate'))}</button><button type="button" class="btn btn-ghost" data-action="export-report">${escapeHtml(t('team.analysis.export'))}</button></div>`;
}

function renderList(titleKey, items, translateItem, t) {
  if (items.length === 0) return '';
  const entries = items.map((item) => `<li>${escapeHtml(translateItem(item))}</li>`).join('');
  return `<div class="analysis-column"><h3>${escapeHtml(t(titleKey))}</h3><ul>${entries}</ul></div>`;
}

function renderAnalysis(analysis, t) {
  const summary = analysis.summary
    ? `<p class="analysis-summary">${escapeHtml(analysis.summary)}</p>`
    : '';
  const dynamics = analysis.dynamics
    ? `<p class="analysis-summary">${escapeHtml(analysis.dynamics)}</p>`
    : '';
  const asText = (item) => item;
  const asCategory = analysis.isAi ? asText : (item) => t(`category.${item}`);
  const columns = [
    renderList('team.analysis.strengths', analysis.strengths, asCategory, t),
    renderList('team.analysis.weaknesses', analysis.weaknesses, asCategory, t),
    renderList('team.analysis.recommendations', analysis.recommendations, asText, t),
  ].join('');
  return `<section class="card analysis" aria-label="${escapeHtml(t('team.analysis.title'))}">
  <div class="view-header"><h2>${escapeHtml(t('team.analysis.title'))}</h2><span class="view-subtitle ember-ink">${escapeHtml(t('team.analysis.by'))}</span></div>
  ${renderAnalysisNotice(analysis, t)}
  ${summary}
  <div class="analysis-columns">${columns}</div>
  ${dynamics}
</section>`;
}

/**
 * @param {ReturnType<typeof buildTeamViewModel>} model
 * @param {Translate} t
 * @returns {string}
 */
export function renderTeamViewHtml(model, t) {
  if (model.isEmpty) return `<div class="card team-empty">${escapeHtml(t('team.noData'))}</div>`;
  return `<p class="view-subtitle">${escapeHtml(t('team.view.subtitle', { developers: model.developerCount, reviews: model.totalReviewCount }))}</p>
${renderHealth(model, t)}
<div class="member-grid-list">${model.members.map((member) => renderMemberCard(member, t)).join('')}</div>
${model.analysis ? renderAnalysis(model.analysis, t) : ''}`;
}
