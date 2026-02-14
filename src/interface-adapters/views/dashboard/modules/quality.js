import { QUALITY_TARGET_SCORE } from './constants.js';

/**
 * @param {number} value
 * @returns {number}
 */
function roundOneDecimal(value) {
  return Number(value.toFixed(1));
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatSignedLabel(value) {
  if (value > 0) return `+${value.toFixed(1)}`;
  return value.toFixed(1);
}

/**
 * @param {number | null} qualityScore
 * @param {number} [qualityTarget]
 * @returns {{
 *   qualityScore: number | null,
 *   qualityTarget: number,
 *   progressPercent: number | null,
 *   clampedProgressPercent: number,
 *   targetDelta: number | null,
 *   targetDeltaLabel: string
 * }}
 */
export function getQualityProgress(qualityScore, qualityTarget = QUALITY_TARGET_SCORE) {
  if (typeof qualityScore !== 'number' || !Number.isFinite(qualityScore)) {
    return {
      qualityScore: null,
      qualityTarget,
      progressPercent: null,
      clampedProgressPercent: 0,
      targetDelta: null,
      targetDeltaLabel: '',
    };
  }

  const progressPercent = (qualityScore / qualityTarget) * 100;
  const clampedProgressPercent = Math.max(0, Math.min(100, progressPercent));
  const targetDelta = qualityScore - qualityTarget;

  return {
    qualityScore,
    qualityTarget,
    progressPercent,
    clampedProgressPercent,
    targetDelta: roundOneDecimal(targetDelta),
    targetDeltaLabel: formatSignedLabel(roundOneDecimal(targetDelta)),
  };
}

/**
 * @param {Record<string, unknown>} mergeRequest
 * @returns {{ direction: 'up' | 'down' | 'flat' | 'unknown', delta: number | null, label: string }}
 */
export function getQualityTrend(mergeRequest) {
  const reviews = Array.isArray(mergeRequest.reviews) ? mergeRequest.reviews : [];
  const scoredReviews = reviews
    .filter((review) => typeof review.score === 'number' && Number.isFinite(review.score))
    .slice(-2);

  if (scoredReviews.length < 2) {
    return { direction: 'unknown', delta: null, label: '' };
  }

  const previousReview = scoredReviews[0];
  const latestReview = scoredReviews[1];
  const delta = roundOneDecimal(latestReview.score - previousReview.score);

  if (delta > 0) {
    return { direction: 'up', delta, label: formatSignedLabel(delta) };
  }
  if (delta < 0) {
    return { direction: 'down', delta, label: formatSignedLabel(delta) };
  }
  return { direction: 'flat', delta, label: delta.toFixed(1) };
}
