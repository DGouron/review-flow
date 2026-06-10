import { escapeHtml } from './html.js';
import { icon } from './icons.js';
import {
  getAvatarBorderClass,
  getTierClass,
  renderLevelRing,
  renderStatBar,
} from './sharedViewHelpers.js';

const CATEGORY_KEYS = ['quality', 'responsiveness', 'codeVolume', 'iteration'];

/**
 * @param {object} developer
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @param {object|null} [aiDeveloper]
 * @returns {string}
 */
function renderDeveloperCard(developer, translate, aiDeveloper) {
  const initial = developer.developerName.charAt(0).toUpperCase();
  const avatarBorderClass = getAvatarBorderClass(developer.overallLevel);
  const tierClass = getTierClass(developer.overallLevel);
  const encodedName = encodeURIComponent(developer.developerName);

  const statBarsHtml = CATEGORY_KEYS.map((key) =>
    renderStatBar(developer.categoryLevels[key], key, translate),
  ).join('');

  const titleHtml = aiDeveloper
    ? `<div class="dev-title ai-title">${icon('sparkles', 'ai-sparkle-icon')} ${escapeHtml(aiDeveloper.title)}</div>`
    : `<div class="dev-title">${translate('title.' + developer.title)}</div>`;

  const metrics = developer.metrics;
  const avgScore = metrics ? Number(metrics.averageScore).toFixed(1) : null;
  const qualityRate = metrics ? Math.round(metrics.firstReviewQualityRate * 100) : null;

  return `
    <div class="dev-card ${tierClass}" onclick="openDevSheet('${encodedName}')" role="button" tabindex="0">
      <div class="dev-card-header">
        <div class="dev-avatar-placeholder ${avatarBorderClass}">${escapeHtml(initial)}</div>
        <div class="dev-card-identity">
          <div class="dev-name">${escapeHtml(developer.developerName)}</div>
          ${titleHtml}
        </div>
        ${renderLevelRing(developer.overallLevel, 52, translate('team.overallLevel') + ' ' + developer.overallLevel + '/10')}
      </div>
      <div class="dev-card-chips">
        ${avgScore ? `<span class="dev-chip dev-chip-score" title="${translate('devSheet.metrics.averageScore')}">${icon('star', 'dev-chip-icon')} ${avgScore}</span>` : ''}
        ${qualityRate !== null ? `<span class="dev-chip dev-chip-quality" title="${translate('devSheet.metrics.firstPassQuality')}">${icon('zap', 'dev-chip-icon')} ${qualityRate}%</span>` : ''}
        <span class="dev-chip dev-chip-count" title="${translate('devSheet.reviewCount', { count: developer.reviewCount })}">${icon('file-search', 'dev-chip-icon')} ${developer.reviewCount}</span>
      </div>
      <div class="dev-card-stats">
        ${statBarsHtml}
      </div>
    </div>
  `;
}

/**
 * @param {object} team
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderTeamHealthStrip(team, translate) {
  const avgLevel =
    (team.averageLevels.quality +
      team.averageLevels.responsiveness +
      team.averageLevels.codeVolume +
      team.averageLevels.iteration) /
    4;
  const tierClass = getTierClass(Math.round(avgLevel));

  return `
    <div class="team-health-strip">
      <div class="team-health-stat" title="${translate('team.healthStrip.developers')}">
        ${icon('users', 'team-health-icon')}
        <span class="team-health-value">${team.developerCount}</span>
      </div>
      <div class="team-health-divider"></div>
      <div class="team-health-stat" title="${translate('team.healthStrip.reviews')}">
        ${icon('file-search', 'team-health-icon')}
        <span class="team-health-value">${team.totalReviewCount}</span>
      </div>
      <div class="team-health-divider"></div>
      <div class="team-health-stat ${tierClass}" title="${translate('team.healthStrip.avgLevel')}">
        ${icon('gauge', 'team-health-icon')}
        <span class="team-health-value">${avgLevel.toFixed(1)}<span class="team-health-unit">/10</span></span>
      </div>
    </div>
  `;
}

/**
 * @param {object} team
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderTeamInsights(team, translate) {
  const strengthTags = team.strengths
    .map(
      (category) =>
        `<span class="insight-tag insight-strength">${icon('thumbs-up', 'insight-icon')} ${translate('category.' + category)}</span>`,
    )
    .join('');

  const weaknessTags = team.weaknesses
    .map(
      (category) =>
        `<span class="insight-tag insight-weakness">${icon('alert-triangle', 'insight-icon')} ${translate('category.' + category)}</span>`,
    )
    .join('');

  const tipsList = team.tips
    .map(
      (tip) =>
        `<li class="insight-tip-item">${icon('lightbulb', 'insight-icon')} ${escapeHtml(tip)}</li>`,
    )
    .join('');

  return `
    <div class="team-insights">
      <div class="team-insight-group">
        <div class="team-insight-section">
          <div class="team-insight-label">${icon('thumbs-up')} ${translate('team.strengths')}</div>
          <div class="team-insight-tags">${strengthTags || '<span class="team-insight-empty">-</span>'}</div>
        </div>
        <div class="team-insight-section">
          <div class="team-insight-label">${icon('alert-triangle')} ${translate('team.weaknesses')}</div>
          <div class="team-insight-tags">${weaknessTags || '<span class="team-insight-empty">-</span>'}</div>
        </div>
      </div>
      ${
        team.tips.length > 0
          ? `
        <div class="team-insight-tips">
          <div class="team-insight-label">${icon('lightbulb')} ${translate('team.tips')}</div>
          <ul class="insight-tips-list">${tipsList}</ul>
        </div>
      `
          : ''
      }
    </div>
  `;
}

/**
 * @param {object|null} aiInsights
 * @param {boolean} hasNewReviewsSinceAiGeneration
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderAiGenerateButton(aiInsights, hasNewReviewsSinceAiGeneration, translate) {
  if (!aiInsights) {
    return `
      <button class="ai-generate-btn" onclick="generateAiInsights()">
        ${icon('sparkles')} ${translate('ai.generate')}
      </button>
    `;
  }

  if (hasNewReviewsSinceAiGeneration) {
    return `
      <div class="ai-generate-bar">
        <button class="ai-generate-btn" onclick="generateAiInsights()">
          ${icon('sparkles')} ${translate('ai.refresh')}
          <span class="ai-badge">${translate('ai.newDataAvailable')}</span>
        </button>
      </div>
    `;
  }

  const generatedDate = new Date(aiInsights.generatedAt).toLocaleDateString();
  return `
    <div class="ai-generate-bar">
      <span class="ai-last-generated">${translate('ai.lastGenerated', { date: generatedDate })}</span>
      <button class="ai-generate-btn ai-refresh-btn" onclick="generateAiInsights()">
        ${icon('refresh-cw')}
      </button>
    </div>
  `;
}

/**
 * @param {object} aiTeam
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderAiTeamCard(aiTeam, translate) {
  const strengthsList = aiTeam.strengths
    .map(
      (strength) =>
        `<li class="ai-list-item">${icon('check-circle', 'ai-list-icon')} ${escapeHtml(strength)}</li>`,
    )
    .join('');

  const weaknessesList = aiTeam.weaknesses
    .map(
      (weakness) =>
        `<li class="ai-list-item">${icon('alert-circle', 'ai-list-icon')} ${escapeHtml(weakness)}</li>`,
    )
    .join('');

  const recommendationsList = aiTeam.recommendations
    .map(
      (recommendation) =>
        `<li class="ai-list-item">${icon('lightbulb', 'ai-list-icon')} ${escapeHtml(recommendation)}</li>`,
    )
    .join('');

  return `
    <div class="ai-team-card">
      <div class="ai-team-card-header clickable" onclick="toggleTeamAnalysis()" role="button" tabindex="0">
        ${icon('sparkles', 'ai-sparkle-icon')} ${translate('ai.teamAnalysis')}
        <span id="team-analysis-toggle" class="toggle-icon"><i data-lucide="chevron-up"></i></span>
      </div>
      <div id="team-analysis-body" class="ai-team-card-body">
        <div class="ai-summary">${escapeHtml(aiTeam.summary)}</div>
        ${
          aiTeam.strengths.length > 0
            ? `
          <div class="ai-section-group">
            <div class="ai-section-label">${icon('check-circle')} ${translate('ai.strengths')}</div>
            <ul class="ai-list">${strengthsList}</ul>
          </div>
        `
            : ''
        }
        ${
          aiTeam.weaknesses.length > 0
            ? `
          <div class="ai-section-group">
            <div class="ai-section-label">${icon('alert-circle')} ${translate('ai.weaknesses')}</div>
            <ul class="ai-list">${weaknessesList}</ul>
          </div>
        `
            : ''
        }
        ${
          aiTeam.recommendations.length > 0
            ? `
          <div class="ai-section-group">
            <div class="ai-section-label">${icon('lightbulb')} ${translate('ai.recommendations')}</div>
            <ul class="ai-list">${recommendationsList}</ul>
          </div>
        `
            : ''
        }
        <div class="ai-section-group">
          <div class="ai-section-label">${icon('users')} ${translate('ai.dynamics')}</div>
          <div class="ai-summary">${escapeHtml(aiTeam.dynamics)}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {object} insightsData
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
export function renderTeamTab(insightsData, translate) {
  if (insightsData.isEmpty) {
    return `<div class="empty-state">${icon('users')} ${translate('team.noData')}</div>`;
  }

  const aiInsights = insightsData.aiInsights || null;
  const hasNewReviews = insightsData.hasNewReviewsSinceAiGeneration === true;

  const aiButtonHtml = renderAiGenerateButton(aiInsights, hasNewReviews, translate);
  const hasAiTeam = aiInsights?.team !== undefined && aiInsights?.team !== null;
  const teamSectionHtml = hasAiTeam
    ? renderAiTeamCard(aiInsights.team, translate)
    : renderTeamInsights(insightsData.team, translate);

  const aiDevelopers = aiInsights?.developers ? aiInsights.developers : [];
  const developerCardsHtml = insightsData.developers
    .map((developer) => {
      const aiDeveloper =
        aiDevelopers.find((aiDev) => aiDev.developerName === developer.developerName) || null;
      return renderDeveloperCard(developer, translate, aiDeveloper);
    })
    .join('');

  const exportButtonHtml = `
    <button class="export-pdf-btn" onclick="exportInsightsPdf()">
      ${icon('file-text')} ${translate('export.pdf')}
    </button>
  `;

  const healthStripHtml = renderTeamHealthStrip(insightsData.team, translate);

  return `
    <div class="team-tab-actions">
      ${aiButtonHtml}
      ${exportButtonHtml}
    </div>
    ${healthStripHtml}
    ${teamSectionHtml}
    <div class="team-grid">
      ${developerCardsHtml}
    </div>
  `;
}

/**
 * @param {string} projectPath
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @param {string} apiUrl
 */
export async function fetchAndRenderTeamTab(projectPath, translate, apiUrl) {
  const container = document.getElementById('team-tab-content');
  if (!container) return;

  container.innerHTML = `<div class="empty-state team-loading">${icon('loader-circle', 'spinning')} ${translate('team.loading')}</div>`;

  try {
    const response = await fetch(`${apiUrl}/api/insights?path=${encodeURIComponent(projectPath)}`);
    const data = await response.json();

    container.innerHTML = renderTeamTab(data, translate);

    setTimeout(() => {
      container.querySelectorAll('.stat-bar-fill[data-target-width]').forEach((bar) => {
        bar.style.width = bar.dataset.targetWidth;
      });
    }, 50);
  } catch (error) {
    console.error('Error fetching team insights:', error);
    container.innerHTML = `<div class="empty-state">${translate('team.noData')}</div>`;
  }
}
