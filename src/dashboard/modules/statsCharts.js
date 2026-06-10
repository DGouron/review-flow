import { t } from './i18n.js';

const COLORS = {
  textPrimary: '#e8efff',
  textMuted: '#8393b0',
  focus: '#7ad8ff',
  success: '#62d3a8',
  warning: '#f4bc71',
  danger: '#f07f88',
  reviewPoint: '#f59e0b',
  followupPoint: '#3b82f6',
  gridLine: 'rgba(131, 147, 176, 0.1)',
  targetLine: 'rgba(98, 211, 168, 0.5)',
  areaFill: 'rgba(122, 216, 255, 0.08)',
};

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
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, cssWidth: number } | null}
 */
function getCanvasContext(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const cssWidth = canvas.parentElement?.clientWidth ? canvas.parentElement.clientWidth - 24 : 460;
  return { canvas, ctx, cssWidth };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} message
 * @param {number} cssWidth
 * @param {number} cssHeight
 */
function drawNoDataMessage(ctx, message, cssWidth, cssHeight) {
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '13px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, cssWidth / 2, cssHeight / 2);
}

/**
 * Compute bezier control points for smooth curves between data points
 * @param {Array<{x: number, y: number}>} points
 * @param {number} index
 * @param {number} tension
 * @returns {{cp1x: number, cp1y: number, cp2x: number, cp2y: number}}
 */
function bezierControlPoints(points, index, tension = 0.3) {
  const previous = points[Math.max(0, index - 1)];
  const current = points[index];
  const next = points[Math.min(points.length - 1, index + 1)];
  const afterNext = points[Math.min(points.length - 1, index + 2)];

  const cp1x = current.x + (next.x - previous.x) * tension;
  const cp1y = current.y + (next.y - previous.y) * tension;
  const cp2x = next.x - (afterNext.x - current.x) * tension;
  const cp2y = next.y - (afterNext.y - current.y) * tension;

  return { cp1x, cp1y, cp2x, cp2y };
}

/**
 * Draw a smooth bezier path through points
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x: number, y: number}>} points
 */
function drawSmoothPath(ctx, points) {
  if (points.length < 2) return;

  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }

  for (let index = 0; index < points.length - 1; index++) {
    const { cp1x, cp1y, cp2x, cp2y } = bezierControlPoints(points, index);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, points[index + 1].x, points[index + 1].y);
  }
}

/**
 * Draw a line chart showing score evolution across reviews
 * @param {string} canvasId
 * @param {Array<{timestamp: string, score: number|null, type?: string}>} reviews
 */
export function drawScoreTrendChart(canvasId, reviews) {
  const setup = getCanvasContext(canvasId);
  if (!setup) return;
  const { ctx, cssWidth } = setup;
  const cssHeight = 180;
  setupHiDpiCanvas(ctx, cssWidth, cssHeight);

  const scoredReviews = reviews
    .filter((review) => review.score !== null && review.score !== undefined)
    .toSorted((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const padding = { top: 20, right: 20, bottom: 30, left: 35 };
  const chartWidth = cssWidth - padding.left - padding.right;
  const chartHeight = cssHeight - padding.top - padding.bottom;

  if (scoredReviews.length === 0) {
    drawNoDataMessage(ctx, t('stats.noChartData'), cssWidth, cssHeight);
    return;
  }

  ctx.font = '10px system-ui, -apple-system, sans-serif';
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

  const points = scoredReviews.map((review, index) => {
    const x =
      scoredReviews.length === 1
        ? padding.left + chartWidth / 2
        : padding.left + (index / (scoredReviews.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (review.score / 10) * chartHeight;
    return { x, y, review };
  });

  if (points.length >= 2) {
    const gradient = ctx.createLinearGradient(0, padding.top, 0, cssHeight - padding.bottom);
    gradient.addColorStop(0, 'rgba(122, 216, 255, 0.12)');
    gradient.addColorStop(1, 'rgba(122, 216, 255, 0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, cssHeight - padding.bottom);
    drawSmoothPath(ctx, points);
    ctx.lineTo(points[points.length - 1].x, cssHeight - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    drawSmoothPath(ctx, points);
    ctx.strokeStyle = COLORS.focus;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  if (scoredReviews.length >= 5) {
    const windowSize = 5;
    const movingAvgPoints = [];
    for (let index = windowSize - 1; index < scoredReviews.length; index++) {
      let sum = 0;
      for (let offset = 0; offset < windowSize; offset++) {
        sum += scoredReviews[index - offset].score;
      }
      const avgScore = sum / windowSize;
      const x =
        scoredReviews.length === 1
          ? padding.left + chartWidth / 2
          : padding.left + (index / (scoredReviews.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - (avgScore / 10) * chartHeight;
      movingAvgPoints.push({ x, y });
    }

    if (movingAvgPoints.length >= 2) {
      ctx.beginPath();
      drawSmoothPath(ctx, movingAvgPoints);
      ctx.strokeStyle = COLORS.success;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const point of points) {
    const color = point.review.type === 'followup' ? COLORS.followupPoint : COLORS.reviewPoint;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = COLORS.textPrimary;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '9px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const maxLabels = Math.min(points.length, 6);
  const labelStep = Math.max(1, Math.floor(points.length / maxLabels));
  for (let labelIndex = 0; labelIndex < points.length; labelIndex += labelStep) {
    const point = points[labelIndex];
    const date = new Date(point.review.timestamp);
    const label = `${date.getDate()}/${date.getMonth() + 1}`;
    ctx.fillText(label, point.x, cssHeight - padding.bottom + 6);
  }
  if (points.length > 1 && (points.length - 1) % labelStep !== 0) {
    const lastPoint = points[points.length - 1];
    const date = new Date(lastPoint.review.timestamp);
    const label = `${date.getDate()}/${date.getMonth() + 1}`;
    ctx.fillText(label, lastPoint.x, cssHeight - padding.bottom + 6);
  }
}

/**
 * Get ISO week number from a date
 * @param {Date} date
 * @returns {number}
 */
function getIsoWeek(date) {
  const target = new Date(date.valueOf());
  const dayNumber = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * Draw a bar chart showing number of reviews per week
 * @param {string} canvasId
 * @param {Array<{timestamp: string}>} reviews
 */
export function drawReviewActivityChart(canvasId, reviews) {
  const setup = getCanvasContext(canvasId);
  if (!setup) return;
  const { ctx, cssWidth } = setup;
  const cssHeight = 180;
  setupHiDpiCanvas(ctx, cssWidth, cssHeight);

  if (!reviews || reviews.length === 0) {
    drawNoDataMessage(ctx, t('stats.noChartData'), cssWidth, cssHeight);
    return;
  }

  const weekCounts = new Map();
  for (const review of reviews) {
    const date = new Date(review.timestamp);
    const year = date.getFullYear();
    const week = getIsoWeek(date);
    const key = `${year}-W${String(week).padStart(2, '0')}`;
    weekCounts.set(key, (weekCounts.get(key) || 0) + 1);
  }

  const sortedWeeks = Array.from(weekCounts.entries())
    .toSorted(([a], [b]) => a.localeCompare(b))
    .slice(-12);

  if (sortedWeeks.length === 0) {
    drawNoDataMessage(ctx, t('stats.noChartData'), cssWidth, cssHeight);
    return;
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 35 };
  const chartWidth = cssWidth - padding.left - padding.right;
  const chartHeight = cssHeight - padding.top - padding.bottom;

  const maxCount = Math.max(...sortedWeeks.map(([, count]) => count));
  const yScale = maxCount > 0 ? chartHeight / (maxCount * 1.15) : 1;

  ctx.font = '10px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.textMuted;
  const yTicks = Math.min(maxCount, 5);
  for (let tick = 0; tick <= yTicks; tick++) {
    const value = Math.round((maxCount / yTicks) * tick);
    const y = padding.top + chartHeight - value * yScale;
    ctx.beginPath();
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 0.5;
    ctx.moveTo(padding.left, y);
    ctx.lineTo(cssWidth - padding.right, y);
    ctx.stroke();
    ctx.fillText(String(value), padding.left - 6, y + 3);
  }

  const barGap = 6;
  const totalBarWidth = chartWidth / sortedWeeks.length;
  const barWidth = Math.max(8, totalBarWidth - barGap);
  const cornerRadius = Math.min(4, barWidth / 3);

  for (let index = 0; index < sortedWeeks.length; index++) {
    const [weekLabel, count] = sortedWeeks[index];
    const barHeight = count * yScale;
    const x = padding.left + index * totalBarWidth + (totalBarWidth - barWidth) / 2;
    const y = padding.top + chartHeight - barHeight;

    const gradient = ctx.createLinearGradient(x, y, x, padding.top + chartHeight);
    gradient.addColorStop(0, COLORS.focus);
    gradient.addColorStop(1, 'rgba(122, 216, 255, 0.3)');

    ctx.beginPath();
    ctx.moveTo(x, padding.top + chartHeight);
    ctx.lineTo(x, y + cornerRadius);
    ctx.arcTo(x, y, x + cornerRadius, y, cornerRadius);
    ctx.arcTo(x + barWidth, y, x + barWidth, y + cornerRadius, cornerRadius);
    ctx.lineTo(x + barWidth, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    if (count > 0 && barHeight > 16) {
      ctx.fillStyle = COLORS.textPrimary;
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(count), x + barWidth / 2, y - 3);
    }

    const shortLabel = weekLabel.split('-')[1];
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '9px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(shortLabel, x + barWidth / 2, cssHeight - padding.bottom + 6);
  }
}

/**
 * Draw a horizontal bar chart showing score distribution
 * @param {string} canvasId
 * @param {Array<{score: number|null}>} reviews
 */
export function drawScoreDistributionChart(canvasId, reviews) {
  const setup = getCanvasContext(canvasId);
  if (!setup) return;
  const { ctx, cssWidth } = setup;
  const cssHeight = 120;
  setupHiDpiCanvas(ctx, cssWidth, cssHeight);

  const scoredReviews = reviews.filter(
    (review) => review.score !== null && review.score !== undefined,
  );

  if (scoredReviews.length === 0) {
    drawNoDataMessage(ctx, t('stats.noChartData'), cssWidth, cssHeight);
    return;
  }

  const ranges = [
    { label: '0-2', min: 0, max: 2, color: COLORS.danger, count: 0 },
    { label: '2-4', min: 2, max: 4, color: '#e8946a', count: 0 },
    { label: '4-6', min: 4, max: 6, color: COLORS.warning, count: 0 },
    { label: '6-8', min: 6, max: 8, color: '#a5d88e', count: 0 },
    { label: '8-10', min: 8, max: 10, color: COLORS.success, count: 0 },
  ];

  for (const review of scoredReviews) {
    const score = review.score;
    for (const range of ranges) {
      if ((score >= range.min && score < range.max) || (range.max === 10 && score === 10)) {
        range.count++;
        break;
      }
    }
  }

  const padding = { top: 8, right: 50, bottom: 8, left: 50 };
  const chartWidth = cssWidth - padding.left - padding.right;
  const chartHeight = cssHeight - padding.top - padding.bottom;

  const maxCount = Math.max(...ranges.map((range) => range.count));
  const barGap = 4;
  const barHeight = Math.min(16, (chartHeight - barGap * (ranges.length - 1)) / ranges.length);
  const totalHeight = ranges.length * barHeight + (ranges.length - 1) * barGap;
  const startY = padding.top + (chartHeight - totalHeight) / 2;
  const cornerRadius = 3;

  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index];
    const y = startY + index * (barHeight + barGap);
    const barWidth = maxCount > 0 ? (range.count / maxCount) * chartWidth : 0;
    const actualBarWidth = Math.max(barWidth, range.count > 0 ? 6 : 0);

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(range.label, padding.left - 8, y + barHeight / 2);

    if (actualBarWidth > 0) {
      ctx.beginPath();
      ctx.roundRect(padding.left, y, actualBarWidth, barHeight, cornerRadius);
      ctx.fillStyle = range.color;
      ctx.fill();
    }

    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(range.count), padding.left + actualBarWidth + 6, y + barHeight / 2);
  }
}

/**
 * Animate a counter from 0 to targetValue
 * @param {HTMLElement} element
 * @param {number} targetValue
 * @param {number} duration
 * @param {string} [suffix]
 */
export function animateCounter(element, targetValue, duration, suffix) {
  const startTime = performance.now();
  const isDecimal = !Number.isInteger(targetValue);
  const displaySuffix = suffix || '';

  function easeOutExpo(progress) {
    return progress === 1 ? 1 : 1 - 2 ** (-10 * progress);
  }

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutExpo(progress);
    const currentValue = targetValue * easedProgress;

    if (isDecimal) {
      element.textContent = currentValue.toFixed(1) + displaySuffix;
    } else {
      element.textContent = Math.round(currentValue) + displaySuffix;
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      if (isDecimal) {
        element.textContent = targetValue.toFixed(1) + displaySuffix;
      } else {
        element.textContent = String(targetValue) + displaySuffix;
      }
    }
  }

  requestAnimationFrame(update);
}
