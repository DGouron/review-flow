import { formatTime, formatDuration } from './formatting.js';
import { escapeHtml, sanitizeHttpUrl } from './html.js';

const COLORS = {
  base: '#0b1220',
  textPrimary: '#e8efff',
  textMuted: '#8393b0',
  focus: '#7ad8ff',
  success: '#62d3a8',
  warning: '#f4bc71',
  danger: '#f07f88',
  reviewPoint: '#f59e0b',
  followupPoint: '#3b82f6',
  gridLine: 'rgba(131, 147, 176, 0.15)',
  targetLine: 'rgba(98, 211, 168, 0.5)',
  areaFill: 'rgba(122, 216, 255, 0.08)',
};

/**
 * @param {object} mr
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @param {string} [mrType]
 * @returns {string}
 */
export function renderMrSheetContent(mr, translate, mrType) {
  const mrPrefix = mr.platform === 'github' ? '#' : '!';
  const assigneeDisplay = mr.assignment?.displayName || mr.assignment?.username || '';
  const assigneeInitial = assigneeDisplay ? assigneeDisplay.charAt(0).toUpperCase() : '?';

  const scoreDisplay =
    typeof mr.latestScore === 'number'
      ? `${mr.latestScore.toFixed(1)}<span class="sheet-stat-unit">${translate('sheet.outOf10')}</span>`
      : '-';

  const threadsDisplay = typeof mr.openThreads === 'number' ? mr.openThreads : 0;

  const durationDisplay = mr.totalDurationMs ? formatDuration(null, null, mr.totalDurationMs) : '-';

  const totalIssues = (mr.totalBlocking || 0) + (mr.totalWarnings || 0);

  const encodedMrId = encodeURIComponent(String(mr.id ?? ''));

  const reviewHistoryRows = (mr.reviews ?? [])
    .slice()
    .toReversed()
    .map((r) => {
      const typeClass = r.type === 'review' ? 'review' : 'followup';
      const typeLabel =
        r.type === 'review'
          ? `<i data-lucide="file-search"></i> Review`
          : `<i data-lucide="refresh-cw"></i> Follow-up`;
      const scoreCell =
        r.score !== null && r.score !== undefined
          ? `<span class="sheet-event-score">${r.score}${translate('sheet.outOf10')}</span>`
          : '-';
      const blockingCell =
        r.blocking > 0 ? `<span class="sheet-event-blocking">${r.blocking}</span>` : '0';
      return `<tr>
      <td><span class="sheet-event-type ${typeClass}">${typeLabel}</span></td>
      <td>${formatTime(r.timestamp)}</td>
      <td>${scoreCell}</td>
      <td>${blockingCell}</td>
    </tr>`;
    })
    .join('');

  const hasReviews = (mr.reviews ?? []).length > 0;
  const reviewHistoryContent = hasReviews
    ? `<table class="sheet-history-table">
        <thead><tr>
          <th>${translate('sheet.type')}</th>
          <th>${translate('sheet.date')}</th>
          <th>${translate('sheet.score')}</th>
          <th>${translate('sheet.blocking')}</th>
        </tr></thead>
        <tbody>${reviewHistoryRows}</tbody>
      </table>`
    : `<div class="empty-state" style="font-size: 0.8rem;">${translate('sheet.noData')}</div>`;

  return `
    <button class="sheet-close" onclick="closeMrSheet()" aria-label="Close">
      <i data-lucide="x"></i>
    </button>

    <div class="sheet-mr-header">
      <div>
        <div class="sheet-mr-number">${mrPrefix}${escapeHtml(String(mr.mrNumber ?? ''))}</div>
        <div class="sheet-mr-title">${escapeHtml(String(mr.title ?? ''))}</div>
        ${
          assigneeDisplay
            ? `
        <div class="sheet-mr-assignee">
          <div class="mr-avatar" style="width:22px;height:22px;font-size:0.65rem;" title="${escapeHtml(assigneeDisplay)}">${escapeHtml(assigneeInitial)}</div>
          ${escapeHtml(assigneeDisplay)}
        </div>`
            : ''
        }
      </div>
    </div>

    <div class="sheet-stats-grid">
      <div class="sheet-stat-card score">
        <div class="sheet-stat-label"><i data-lucide="star"></i> ${translate('sheet.qualityScore')}</div>
        <div class="sheet-stat-value">${scoreDisplay}</div>
        <div class="sheet-stat-detail">${translate('sheet.target', { target: 8 })}</div>
      </div>
      <div class="sheet-stat-card threads">
        <div class="sheet-stat-label"><i data-lucide="message-circle"></i> ${translate('sheet.openThreads')}</div>
        <div class="sheet-stat-value">${threadsDisplay}</div>
      </div>
      <div class="sheet-stat-card duration">
        <div class="sheet-stat-label"><i data-lucide="clock"></i> ${translate('sheet.reviewDuration')}</div>
        <div class="sheet-stat-value">${durationDisplay}</div>
      </div>
      <div class="sheet-stat-card issues">
        <div class="sheet-stat-label"><i data-lucide="alert-triangle"></i> ${translate('sheet.totalIssues')}</div>
        <div class="sheet-stat-value">${totalIssues}</div>
        <div class="sheet-stat-detail">${mr.totalBlocking || 0} blocking, ${mr.totalWarnings || 0} warnings</div>
      </div>
    </div>
    ${(() => {
      const latestDiff = [...(mr.reviews ?? [])].toReversed().find((r) => r.diffStats)?.diffStats;
      const commitsDisplay = latestDiff ? latestDiff.commitsCount : '-';
      const additionsDisplay = latestDiff ? '+' + latestDiff.additions : '-';
      const deletionsDisplay = latestDiff ? '-' + latestDiff.deletions : '-';
      return `
    <div class="sheet-stats-grid" style="margin-top: 0.5rem">
      <div class="sheet-stat-card commits">
        <div class="sheet-stat-label"><i data-lucide="git-commit"></i> ${translate('sheet.commits')}</div>
        <div class="sheet-stat-value">${commitsDisplay}</div>
      </div>
      <div class="sheet-stat-card additions-card">
        <div class="sheet-stat-label"><i data-lucide="plus"></i> ${translate('sheet.additions')}</div>
        <div class="sheet-stat-value">${additionsDisplay}</div>
      </div>
      <div class="sheet-stat-card deletions-card">
        <div class="sheet-stat-label"><i data-lucide="minus"></i> ${translate('sheet.deletions')}</div>
        <div class="sheet-stat-value">${deletionsDisplay}</div>
      </div>
    </div>`;
    })()}

    <div class="sheet-section">
      <div class="sheet-section-title"><i data-lucide="trending-up"></i> ${translate('sheet.scoreTimeline')}</div>
      <div class="sheet-canvas-wrap">
        <canvas id="sheet-score-canvas" width="460" height="180"></canvas>
      </div>
    </div>

    <div class="sheet-section">
      <div class="sheet-section-title"><i data-lucide="pie-chart"></i> ${translate('sheet.issuesBreakdown')}</div>
      <div class="sheet-canvas-wrap">
        <canvas id="sheet-issues-canvas" width="460" height="120"></canvas>
      </div>
    </div>

    <div class="sheet-section">
      <div class="sheet-section-title"><i data-lucide="history"></i> ${translate('sheet.reviewHistory')}</div>
      ${reviewHistoryContent}
    </div>

    <div class="sheet-section">
      <div class="sheet-section-title"><i data-lucide="info"></i> ${translate('sheet.details')}</div>
      <div class="sheet-details-grid">
        <div class="sheet-detail-row">
          <span class="sheet-detail-label"><i data-lucide="git-branch"></i> Source</span>
          <span class="sheet-detail-value">${escapeHtml(String(mr.sourceBranch ?? ''))}</span>
        </div>
        <div class="sheet-detail-row">
          <span class="sheet-detail-label"><i data-lucide="git-merge"></i> Target</span>
          <span class="sheet-detail-value">${escapeHtml(String(mr.targetBranch ?? ''))}</span>
        </div>
        <div class="sheet-detail-row">
          <span class="sheet-detail-label"><i data-lucide="calendar"></i> ${translate('sheet.date')}</span>
          <span class="sheet-detail-value">${formatTime(mr.createdAt)}</span>
        </div>
        ${
          mr.lastReviewAt
            ? `
        <div class="sheet-detail-row">
          <span class="sheet-detail-label"><i data-lucide="file-search"></i> Last review</span>
          <span class="sheet-detail-value">${formatTime(mr.lastReviewAt)}</span>
        </div>`
            : ''
        }
      </div>
    </div>

    <div class="sheet-footer">
      <div class="sheet-footer-actions">
        <button class="btn-action" onclick="triggerFollowup('${encodedMrId}')"><i data-lucide="refresh-cw"></i> ${translate('button.followup')}</button>
        ${mrType === 'pending-approval' ? `<button class="btn-action approve" onclick="approveMr('${encodedMrId}')"><i data-lucide="check-circle"></i> ${translate('sheet.approve')}</button>` : ''}
        <a href="${sanitizeHttpUrl(mr.url)}" target="_blank" rel="noopener noreferrer" class="btn-action open" onclick="return onUsefulLinkAction()"><i data-lucide="external-link"></i> ${translate('button.open')}</a>
      </div>
    </div>
  `;
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @returns {number}
 */
function setupHiDpiCanvas(context, cssWidth, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const canvas = context.canvas;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  context.scale(dpr, dpr);
  return dpr;
}

/**
 * @param {string} canvasId
 * @param {Array<{type: string, timestamp: string, score: number|null, blocking: number}>} reviews
 */
export function drawScoreTimeline(canvasId, reviews) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cssWidth = canvas.parentElement?.clientWidth ? canvas.parentElement.clientWidth - 24 : 460;
  const cssHeight = 180;
  setupHiDpiCanvas(ctx, cssWidth, cssHeight);

  const scoredReviews = reviews
    .filter((r) => r.score !== null && r.score !== undefined)
    .toSorted((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const padding = { top: 20, right: 20, bottom: 35, left: 35 };
  const chartWidth = cssWidth - padding.left - padding.right;
  const chartHeight = cssHeight - padding.top - padding.bottom;

  if (scoredReviews.length === 0) {
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data', cssWidth / 2, cssHeight / 2);
    return;
  }

  ctx.fillStyle = COLORS.gridLine;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let score = 2; score <= 10; score += 2) {
    const y = padding.top + chartHeight - (score / 10) * chartHeight;
    ctx.beginPath();
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 0.5;
    ctx.moveTo(padding.left, y);
    ctx.lineTo(cssWidth - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(String(score), padding.left - 6, y + 3);
  }

  const targetY = padding.top + chartHeight - (8 / 10) * chartHeight;
  ctx.beginPath();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = COLORS.targetLine;
  ctx.lineWidth = 1;
  ctx.moveTo(padding.left, targetY);
  ctx.lineTo(cssWidth - padding.right, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (scoredReviews.length === 1) {
    const review = scoredReviews[0];
    const x = padding.left + chartWidth / 2;
    const y = padding.top + chartHeight - (review.score / 10) * chartHeight;
    const color = review.type === 'followup' ? COLORS.followupPoint : COLORS.reviewPoint;

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = COLORS.textPrimary;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const dateLabel = formatTime(review.timestamp);
    ctx.fillText(dateLabel, x, cssHeight - 8);
    return;
  }

  const points = scoredReviews.map((review, index) => {
    const x = padding.left + (index / (scoredReviews.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (review.score / 10) * chartHeight;
    return { x, y, review };
  });

  const gradient = ctx.createLinearGradient(0, padding.top, 0, cssHeight - padding.bottom);
  gradient.addColorStop(0, COLORS.areaFill);
  gradient.addColorStop(1, 'transparent');

  ctx.beginPath();
  ctx.moveTo(points[0].x, cssHeight - padding.bottom);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, cssHeight - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
    ctx.lineTo(points[pointIndex].x, points[pointIndex].y);
  }
  ctx.strokeStyle = COLORS.focus;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  points.forEach((p) => {
    const color = p.review.type === 'followup' ? COLORS.followupPoint : COLORS.reviewPoint;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = COLORS.textPrimary;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const maxLabels = Math.min(points.length, 5);
  const labelStep = Math.max(1, Math.floor(points.length / maxLabels));
  for (let labelIndex = 0; labelIndex < points.length; labelIndex += labelStep) {
    const p = points[labelIndex];
    const dateLabel = formatTime(p.review.timestamp);
    ctx.fillText(dateLabel, p.x, cssHeight - 8);
  }
  if ((points.length - 1) % labelStep !== 0) {
    const lastPoint = points[points.length - 1];
    ctx.fillText(formatTime(lastPoint.review.timestamp), lastPoint.x, cssHeight - 8);
  }
}

/**
 * @param {string} canvasId
 * @param {number} blocking
 * @param {number} warnings
 * @param {number} resolved
 */
export function drawIssuesBreakdown(canvasId, blocking, warnings, resolved) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cssWidth = canvas.parentElement?.clientWidth ? canvas.parentElement.clientWidth - 24 : 460;
  const cssHeight = 120;
  setupHiDpiCanvas(ctx, cssWidth, cssHeight);

  const total = blocking + warnings + resolved;

  if (total === 0) {
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No issues', cssWidth / 2, cssHeight / 2);
    return;
  }

  const barY = 30;
  const barHeight = 28;
  const barPadding = 20;
  const barWidth = cssWidth - barPadding * 2;
  const radius = 8;

  const segments = [
    { value: blocking, color: COLORS.danger, label: 'Blocking' },
    { value: warnings, color: COLORS.warning, label: 'Warnings' },
    { value: resolved, color: COLORS.success, label: 'Resolved' },
  ].filter((segment) => segment.value > 0);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(barPadding, barY, barWidth, barHeight, radius);
  ctx.clip();

  let currentX = barPadding;
  segments.forEach((segment) => {
    const segmentWidth = (segment.value / total) * barWidth;
    ctx.fillStyle = segment.color;
    ctx.fillRect(currentX, barY, segmentWidth, barHeight);
    currentX += segmentWidth;
  });
  ctx.restore();

  const labelY = barY + barHeight + 28;
  ctx.font = '11px system-ui, sans-serif';

  const allSegments = [
    { value: blocking, color: COLORS.danger, label: 'Blocking' },
    { value: warnings, color: COLORS.warning, label: 'Warnings' },
    { value: resolved, color: COLORS.success, label: 'Resolved' },
  ];

  const segmentSpacing = cssWidth / allSegments.length;
  allSegments.forEach((segment, segmentIndex) => {
    const labelX = segmentSpacing * segmentIndex + segmentSpacing / 2;

    ctx.beginPath();
    ctx.arc(labelX - 25, labelY - 4, 4, 0, Math.PI * 2);
    ctx.fillStyle = segment.color;
    ctx.fill();

    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'left';
    ctx.fillText(`${segment.label}: ${segment.value}`, labelX - 18, labelY);
  });
}
