/**
 * Dashboard module — standalone stats page humble object.
 * Pure functions that build the page markup from the /api/stats payload.
 * No DOM access, no fetch, no global state. Charts are drawn by the page
 * glue (stats.html) after this markup is injected, using statsCharts.js.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

import { escapeHtml } from './html.js';
import { renderKeyInsightsHtml } from './keyInsights.js';

/**
 * @param {'up' | 'down' | 'stable'} trend
 * @returns {string}
 */
function trendIcon(trend) {
  if (trend === 'up') return '<span class="stat-trend up"><i data-lucide="trending-up"></i></span>';
  if (trend === 'down')
    return '<span class="stat-trend down"><i data-lucide="trending-down"></i></span>';
  return '<span class="stat-trend flat"><i data-lucide="minus"></i></span>';
}

/**
 * @param {{ modifier: string, icon: string, value: number, labelKey: string, average?: string | null }} tile
 * @param {(key: string) => string} t
 * @returns {string}
 */
function heroTile(tile, t) {
  const sub =
    tile.average && tile.average !== '-'
      ? `<div class="stats-hero-sub">~${escapeHtml(tile.average)}/MR</div>`
      : '';
  return `
    <div class="stats-hero-tile hero-${tile.modifier}">
      <div class="stats-hero-icon"><i data-lucide="${tile.icon}"></i></div>
      <div class="stats-hero-value"><span class="stat-main" data-target="${tile.value}">0</span></div>
      <div class="stats-hero-label">${t(tile.labelKey)}</div>
      ${sub}
    </div>`;
}

/**
 * @param {object} summary
 * @returns {string}
 */
function renderRatioBar(summary) {
  const additions = summary.totalAdditions || 0;
  const deletions = summary.totalDeletions || 0;
  const total = additions + deletions;
  const additionsPercent = total > 0 ? (additions / total) * 100 : 0;
  const deletionsPercent = total > 0 ? (deletions / total) * 100 : 0;
  return `
    <div class="stats-ratio-bar" aria-hidden="true">
      <span class="stats-ratio-add" style="width:${additionsPercent}%"></span>
      <span class="stats-ratio-del" style="width:${deletionsPercent}%"></span>
    </div>`;
}

/**
 * @param {object} summary
 * @param {(key: string) => string} t
 * @returns {string}
 */
function renderVolumeHero(summary, t) {
  const netLines = (summary.totalAdditions || 0) - (summary.totalDeletions || 0);
  const tiles = [
    {
      modifier: 'reviews',
      icon: 'file-search',
      value: summary.totalReviews,
      labelKey: 'stats.reviews',
      average: null,
    },
    {
      modifier: 'commits',
      icon: 'git-commit-horizontal',
      value: summary.totalCommits ?? 0,
      labelKey: 'stats.commits',
      average: summary.averageCommits,
    },
    {
      modifier: 'additions',
      icon: 'plus',
      value: summary.totalAdditions ?? 0,
      labelKey: 'stats.linesAdded',
      average: summary.averageAdditions,
    },
    {
      modifier: 'deletions',
      icon: 'minus',
      value: summary.totalDeletions ?? 0,
      labelKey: 'stats.linesDeleted',
      average: summary.averageDeletions,
    },
    { modifier: 'net', icon: 'equal', value: netLines, labelKey: 'stats.netLines', average: null },
  ];
  return `
    <section class="stats-volume">
      <div class="stats-section-eyebrow">// ${t('stats.volume').toUpperCase()}</div>
      <div class="stats-hero-grid">
        ${tiles.map((tile) => heroTile(tile, t)).join('')}
      </div>
      ${renderRatioBar(summary)}
    </section>`;
}

/**
 * @param {object} summary
 * @param {(key: string) => string} t
 * @returns {string}
 */
function renderQualityKpis(summary, t) {
  const numericScore = parseFloat(summary.averageScore);
  const isScoreNumeric = !Number.isNaN(numericScore);
  const scoreValue = isScoreNumeric
    ? `<span class="stat-main" data-target="${numericScore}" data-suffix="/10">0</span>`
    : `<span class="stat-main">${escapeHtml(summary.averageScore)}</span><span class="stat-denominator">/10</span>`;
  return `
    <section class="stats-quality">
      <div class="stats-section-eyebrow">// QUALITY</div>
      <div class="stats-grid">
        <div class="stat-card metric-score">
          <div class="stat-value">${scoreValue}${trendIcon(summary.trend.score)}</div>
          <div class="stat-label"><i data-lucide="star"></i> ${t('stats.averageScore')}</div>
        </div>
        <div class="stat-card metric-time">
          <div class="stat-value"><span class="stat-main">${escapeHtml(summary.totalTime)}</span></div>
          <div class="stat-label"><i data-lucide="timer"></i> ${t('stats.totalTime')}</div>
        </div>
        <div class="stat-card metric-average-time">
          <div class="stat-value"><span class="stat-main">${escapeHtml(summary.averageTime)}</span></div>
          <div class="stat-label"><i data-lucide="clock"></i> ${t('stats.averageTime')}</div>
        </div>
        <div class="stat-card warning metric-blocking">
          <div class="stat-value"><span class="stat-main" data-target="${summary.totalBlocking}">0</span>${trendIcon(summary.trend.blocking)}</div>
          <div class="stat-label"><i data-lucide="octagon-alert"></i> ${t('stats.blocking')}</div>
        </div>
        <div class="stat-card metric-warnings">
          <div class="stat-value"><span class="stat-main" data-target="${summary.totalWarnings}">0</span></div>
          <div class="stat-label"><i data-lucide="alert-triangle"></i> ${t('stats.warnings')}</div>
        </div>
      </div>
    </section>`;
}

/**
 * @param {Array<{ assignedBy?: string }>} reviews
 * @param {(key: string) => string} t
 * @returns {string}
 */
function renderDevFilter(reviews, t) {
  const developers = [...new Set(reviews.map((review) => review.assignedBy).filter(Boolean))];
  const buttons = developers
    .map(
      (developer) =>
        `<button class="dev-filter-btn" data-dev="${escapeHtml(developer)}" onclick="filterScoreTrend('${escapeHtml(developer)}')">${escapeHtml(developer)}</button>`,
    )
    .join('');
  return `
    <div class="dev-filter" id="dev-filter-container">
      <button class="dev-filter-btn active" data-dev="all" onclick="filterScoreTrend('all')">${t('stats.allDevs')}</button>
      ${buttons}
    </div>`;
}

/**
 * @param {Array<object>} reviews
 * @param {(key: string) => string} t
 * @returns {string}
 */
function renderCharts(reviews, t) {
  return `
    <div class="stats-charts-row">
      <div class="stats-chart-card">
        <div class="stats-chart-title"><i data-lucide="trending-up"></i> ${t('stats.scoreTrend')}</div>
        ${renderDevFilter(reviews, t)}
        <canvas id="stats-score-trend" class="stats-canvas"></canvas>
      </div>
      <div class="stats-chart-card">
        <div class="stats-chart-title"><i data-lucide="bar-chart-3"></i> ${t('stats.reviewActivity')}</div>
        <canvas id="stats-activity" class="stats-canvas"></canvas>
      </div>
    </div>
    <div class="stats-charts-row">
      <div class="stats-chart-card">
        <div class="stats-chart-title"><i data-lucide="pie-chart"></i> ${t('stats.scoreDistribution')}</div>
        <canvas id="stats-distribution" class="stats-canvas"></canvas>
      </div>
      <div class="stats-chart-card">
        <div class="stats-chart-title"><i data-lucide="calendar"></i> ${t('stats.reviewsPerMonth')}</div>
        <canvas id="stats-reviews-per-month" class="stats-canvas"></canvas>
      </div>
    </div>
    <div class="stats-charts-row">
      <div class="stats-chart-card full-width">
        <div class="stats-chart-title"><i data-lucide="bug"></i> ${t('stats.bugsByCategory')}</div>
        <canvas id="stats-bugs-category" class="stats-canvas-wide"></canvas>
      </div>
    </div>`;
}

/**
 * Build the full inner markup of the standalone stats page.
 *
 * @param {{ summary: object | null, stats?: { reviews?: Array<object> }, keyInsights?: object | null }} data
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function renderStatsPageHtml(data, t) {
  const summary = data && data.summary;
  if (!summary) {
    return `<div class="empty-state">${t('empty.statsNoData')}</div>`;
  }
  const reviews = (data.stats && data.stats.reviews) || [];
  const insights = data.keyInsights ? renderKeyInsightsHtml(data.keyInsights) : '';
  return `
    ${renderVolumeHero(summary, t)}
    ${renderQualityKpis(summary, t)}
    ${renderCharts(reviews, t)}
    ${insights ? `<section class="stats-insights">${insights}</section>` : ''}
  `;
}
