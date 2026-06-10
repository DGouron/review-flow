const CATEGORY_KEYS = ['quality', 'responsiveness', 'codeVolume', 'iteration'];

/**
 * @param {string | null | undefined} text
 * @returns {string}
 */
function escapeForPrint(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {number} level
 * @returns {string}
 */
function getLevelColor(level) {
  if (level <= 3) return '#ef4444';
  if (level <= 6) return '#f59e0b';
  if (level <= 8) return '#3b82f6';
  return '#22c55e';
}

/**
 * @param {number} level
 * @param {string} categoryName
 * @returns {string}
 */
function renderPrintLevelBar(level, categoryName) {
  const widthPercent = (level / 10) * 100;
  const color = getLevelColor(level);
  return `
    <div class="print-stat-row">
      <span class="print-stat-label">${categoryName}</span>
      <div class="print-level-bar">
        <div class="print-level-fill" style="width: ${widthPercent}%; background: ${color};"></div>
      </div>
      <span class="print-level-value">${level}/10</span>
    </div>
  `;
}

/**
 * @param {object} team
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderPrintTeamInsights(team, translate) {
  const strengthTags = team.strengths
    .map(
      (/** @type {string} */ category) =>
        `<span class="print-tag print-tag-strength">${translate('category.' + category)}</span>`,
    )
    .join(' ');

  const weaknessTags = team.weaknesses
    .map(
      (/** @type {string} */ category) =>
        `<span class="print-tag print-tag-weakness">${translate('category.' + category)}</span>`,
    )
    .join(' ');

  const tipsHtml =
    team.tips.length > 0
      ? `<div class="print-subsection">
        <h4>${translate('team.tips')}</h4>
        <ul>${team.tips.map((/** @type {string} */ tip) => `<li>${escapeForPrint(tip)}</li>`).join('')}</ul>
      </div>`
      : '';

  return `
    <div class="print-subsection">
      <h4>${translate('team.strengths')}</h4>
      <div class="print-tags">${strengthTags || '-'}</div>
    </div>
    <div class="print-subsection">
      <h4>${translate('team.weaknesses')}</h4>
      <div class="print-tags">${weaknessTags || '-'}</div>
    </div>
    ${tipsHtml}
  `;
}

/**
 * @param {object} aiTeam
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderPrintAiTeam(aiTeam, translate) {
  const strengthsList =
    aiTeam.strengths.length > 0
      ? `<div class="print-subsection">
        <h4>${translate('ai.strengths')}</h4>
        <ul>${aiTeam.strengths.map((/** @type {string} */ item) => `<li>${escapeForPrint(item)}</li>`).join('')}</ul>
      </div>`
      : '';

  const weaknessesList =
    aiTeam.weaknesses.length > 0
      ? `<div class="print-subsection">
        <h4>${translate('ai.weaknesses')}</h4>
        <ul>${aiTeam.weaknesses.map((/** @type {string} */ item) => `<li>${escapeForPrint(item)}</li>`).join('')}</ul>
      </div>`
      : '';

  const recommendationsList =
    aiTeam.recommendations.length > 0
      ? `<div class="print-subsection">
        <h4>${translate('ai.recommendations')}</h4>
        <ul>${aiTeam.recommendations.map((/** @type {string} */ item) => `<li>${escapeForPrint(item)}</li>`).join('')}</ul>
      </div>`
      : '';

  return `
    <p class="print-summary">${escapeForPrint(aiTeam.summary)}</p>
    ${strengthsList}
    ${weaknessesList}
    ${recommendationsList}
    <div class="print-subsection">
      <h4>${translate('ai.dynamics')}</h4>
      <p>${escapeForPrint(aiTeam.dynamics)}</p>
    </div>
  `;
}

/**
 * @param {object} developer
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @param {object|null} aiDeveloper
 * @returns {string}
 */
function renderPrintDeveloper(developer, translate, aiDeveloper) {
  const titleText = aiDeveloper
    ? escapeForPrint(aiDeveloper.title)
    : translate('title.' + developer.title);

  const levelBarsHtml = CATEGORY_KEYS.map((key) =>
    renderPrintLevelBar(developer.categoryLevels[key].level, translate('category.' + key)),
  ).join('');

  const metricsHtml = developer.metrics
    ? `<div class="print-metrics">
        <h4>${translate('export.metrics')}</h4>
        <div class="print-metrics-grid">
          <div class="print-metric">
            <span class="print-metric-value">${Number(developer.metrics.averageScore).toFixed(1)}/10</span>
            <span class="print-metric-label">${translate('export.avgScore')}</span>
          </div>
          <div class="print-metric">
            <span class="print-metric-value">${Number(developer.metrics.averageBlocking).toFixed(1)}</span>
            <span class="print-metric-label">${translate('export.avgBlocking')}</span>
          </div>
          <div class="print-metric">
            <span class="print-metric-value">${Math.round(developer.metrics.firstReviewQualityRate * 100)}%</span>
            <span class="print-metric-label">${translate('export.firstPassRate')}</span>
          </div>
          <div class="print-metric">
            <span class="print-metric-value">${developer.metrics.averageDuration}</span>
            <span class="print-metric-label">${translate('export.avgDuration')}</span>
          </div>
        </div>
      </div>`
    : '';

  const strengthsHtml =
    developer.strengths.length > 0
      ? `<div class="print-subsection">
        <h4>${translate('team.strengths')}</h4>
        <ul>${developer.strengths.map((/** @type {string} */ category) => `<li>${translate('category.' + category)}</li>`).join('')}</ul>
      </div>`
      : '';

  const weaknessesHtml =
    developer.weaknesses.length > 0
      ? `<div class="print-subsection">
        <h4>${translate('team.weaknesses')}</h4>
        <ul>${developer.weaknesses.map((/** @type {string} */ category) => `<li>${translate('category.' + category)}</li>`).join('')}</ul>
      </div>`
      : '';

  const aiSectionHtml = aiDeveloper ? renderPrintAiDeveloper(aiDeveloper, translate) : '';

  return `
    <div class="print-developer">
      <div class="print-developer-header">
        <div class="print-developer-identity">
          <h3>${escapeForPrint(developer.developerName)}</h3>
          <span class="print-developer-title">${titleText}</span>
        </div>
        <div class="print-developer-level">
          <span class="print-level-number">${developer.overallLevel}</span>
          <span class="print-level-label">${translate('export.overallLevel')}</span>
        </div>
      </div>
      <div class="print-level-bars">
        ${levelBarsHtml}
      </div>
      ${metricsHtml}
      ${strengthsHtml}
      ${weaknessesHtml}
      ${aiSectionHtml}
    </div>
  `;
}

/**
 * @param {object} aiDeveloper
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderPrintAiDeveloper(aiDeveloper, translate) {
  const strengthsList =
    aiDeveloper.strengths.length > 0
      ? `<div class="print-subsection">
        <h4>${translate('ai.strengths')}</h4>
        <ul>${aiDeveloper.strengths.map((/** @type {string} */ item) => `<li>${escapeForPrint(item)}</li>`).join('')}</ul>
      </div>`
      : '';

  const weaknessesList =
    aiDeveloper.weaknesses.length > 0
      ? `<div class="print-subsection">
        <h4>${translate('ai.weaknesses')}</h4>
        <ul>${aiDeveloper.weaknesses.map((/** @type {string} */ item) => `<li>${escapeForPrint(item)}</li>`).join('')}</ul>
      </div>`
      : '';

  const recommendationsList =
    aiDeveloper.recommendations.length > 0
      ? `<div class="print-subsection">
        <h4>${translate('ai.recommendations')}</h4>
        <ul>${aiDeveloper.recommendations.map((/** @type {string} */ item) => `<li>${escapeForPrint(item)}</li>`).join('')}</ul>
      </div>`
      : '';

  const summaryHtml = aiDeveloper.summary
    ? `<p class="print-summary">${escapeForPrint(aiDeveloper.summary)}</p>`
    : '';

  return `
    <div class="print-ai-section">
      ${summaryHtml}
      ${strengthsList}
      ${weaknessesList}
      ${recommendationsList}
    </div>
  `;
}

/**
 * @returns {string}
 */
function getReportStyles() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1a1a2e;
      background: white;
      padding: 2rem;
      line-height: 1.5;
    }
    .report-header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 2px solid #e5e7eb;
    }
    .report-header h1 {
      font-size: 1.75rem;
      color: #1a1a2e;
      margin-bottom: 0.5rem;
    }
    .report-header p {
      color: #6b7280;
      font-size: 0.875rem;
    }
    .report-section {
      margin-bottom: 2rem;
    }
    .report-section > h2 {
      font-size: 1.25rem;
      color: #1a1a2e;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #e5e7eb;
    }
    .print-subsection {
      margin-bottom: 1rem;
    }
    .print-subsection h4 {
      font-size: 0.875rem;
      color: #374151;
      margin-bottom: 0.375rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }
    .print-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }
    .print-tag {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.8125rem;
    }
    .print-tag-strength {
      background: #dcfce7;
      color: #166534;
    }
    .print-tag-weakness {
      background: #fef2f2;
      color: #991b1b;
    }
    .print-summary {
      color: #374151;
      margin-bottom: 0.75rem;
      font-style: italic;
    }
    ul {
      list-style: none;
      padding-left: 0;
    }
    ul li {
      padding: 0.1875rem 0;
      font-size: 0.875rem;
      color: #374151;
    }
    ul li::before {
      content: '\\2022';
      margin-right: 0.5rem;
      color: #9ca3af;
    }
    .print-developer {
      page-break-inside: avoid;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .print-developer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .print-developer-header h3 {
      font-size: 1.125rem;
      color: #1a1a2e;
    }
    .print-developer-title {
      display: block;
      font-size: 0.8125rem;
      color: #6b7280;
    }
    .print-developer-level {
      text-align: center;
    }
    .print-level-number {
      display: block;
      font-size: 2rem;
      font-weight: 700;
      color: #3b82f6;
      line-height: 1;
    }
    .print-level-label {
      display: block;
      font-size: 0.6875rem;
      color: #6b7280;
      text-transform: uppercase;
    }
    .print-level-bars {
      margin-bottom: 1rem;
    }
    .print-stat-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.375rem;
    }
    .print-stat-label {
      flex: 0 0 120px;
      font-size: 0.8125rem;
      color: #374151;
    }
    .print-level-bar {
      flex: 1;
      height: 0.625rem;
      background: #f3f4f6;
      border-radius: 0.3125rem;
      overflow: hidden;
    }
    .print-level-fill {
      height: 100%;
      border-radius: 0.3125rem;
      transition: none;
    }
    .print-level-value {
      flex: 0 0 40px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #1a1a2e;
      text-align: right;
    }
    .print-metrics {
      margin-bottom: 1rem;
    }
    .print-metrics h4 {
      font-size: 0.875rem;
      color: #374151;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }
    .print-metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
    }
    .print-metric {
      text-align: center;
      padding: 0.5rem;
      background: #f9fafb;
      border-radius: 0.375rem;
    }
    .print-metric-value {
      display: block;
      font-size: 1.125rem;
      font-weight: 700;
      color: #1a1a2e;
    }
    .print-metric-label {
      display: block;
      font-size: 0.6875rem;
      color: #6b7280;
    }
    .print-ai-section {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px dashed #d1d5db;
    }
    .report-footer {
      text-align: center;
      padding-top: 1.5rem;
      margin-top: 2rem;
      border-top: 2px solid #e5e7eb;
      color: #9ca3af;
      font-size: 0.75rem;
    }
    @media print {
      body { padding: 0; }
      .print-developer { break-inside: avoid; }
    }
  `;
}

/**
 * @param {object} insightsData
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
export function buildInsightsReport(insightsData, translate) {
  const generationDate = new Date().toLocaleDateString();
  const aiInsights = insightsData.aiInsights || null;
  const hasAiTeam = aiInsights?.team !== undefined && aiInsights?.team !== null;

  const teamContentHtml = hasAiTeam
    ? renderPrintAiTeam(aiInsights.team, translate)
    : renderPrintTeamInsights(insightsData.team, translate);

  const sortedDevelopers = [...insightsData.developers].toSorted(
    (
      /** @type {{ overallLevel: number }} */ first,
      /** @type {{ overallLevel: number }} */ second,
    ) => second.overallLevel - first.overallLevel,
  );

  const aiDevelopers = aiInsights?.developers ? aiInsights.developers : [];

  const developerSectionsHtml = sortedDevelopers
    .map((developer) => {
      const aiDeveloper =
        aiDevelopers.find(
          (/** @type {{ developerName: string }} */ aiDev) =>
            aiDev.developerName === developer.developerName,
        ) || null;
      return renderPrintDeveloper(developer, translate, aiDeveloper);
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${translate('export.title')}</title>
<style>${getReportStyles()}</style>
</head>
<body>
<header class="report-header">
  <h1>${translate('export.title')}</h1>
  <p>${translate('export.generatedAt', { date: generationDate })}</p>
</header>

<section class="report-section">
  <h2>${translate('export.teamSection')}</h2>
  ${teamContentHtml}
</section>

<section class="report-section">
  <h2>${translate('export.developerSection')}</h2>
  ${developerSectionsHtml}
</section>

<footer class="report-footer">
  <p>${translate('export.generatedBy')}</p>
</footer>
</body>
</html>`;
}
