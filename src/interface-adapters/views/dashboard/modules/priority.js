import { QUALITY_TARGET_SCORE } from './constants.js';

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toNullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * @param {Record<string, unknown>} mergeRequest
 * @returns {number}
 */
function getReferenceTimestamp(mergeRequest) {
  const preferredDate = typeof mergeRequest.lastReviewAt === 'string'
    ? mergeRequest.lastReviewAt
    : typeof mergeRequest.createdAt === 'string'
      ? mergeRequest.createdAt
      : '';

  const parsedTimestamp = preferredDate ? Date.parse(preferredDate) : Number.NaN;
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : Number.MAX_SAFE_INTEGER;
}

/**
 * @param {Record<string, unknown>} mergeRequest
 * @param {number} qualityTarget
 * @param {number} nowTimestamp
 * @returns {number}
 */
function computeUrgencyScore(mergeRequest, qualityTarget, nowTimestamp) {
  const openThreads = toNullableNumber(mergeRequest.openThreads) ?? 0;
  const latestScore = toNullableNumber(mergeRequest.latestScore);
  const referenceTimestamp = getReferenceTimestamp(mergeRequest);
  const ageHours = referenceTimestamp === Number.MAX_SAFE_INTEGER
    ? 0
    : Math.max(0, (nowTimestamp - referenceTimestamp) / HOUR_IN_MILLISECONDS);

  const threadScore = openThreads * 12;
  const qualityGap = latestScore === null ? 2 : Math.max(0, qualityTarget - latestScore);
  const qualityScore = qualityGap * 6;
  const ageScore = Math.min(12, ageHours * 0.2);

  return threadScore + qualityScore + ageScore;
}

/**
 * @param {Array<Record<string, unknown>>} pendingFix
 * @param {{ nowIsoDate?: string, qualityTarget?: number }} [options]
 * @returns {Array<Record<string, unknown>>}
 */
export function rankPendingFixForNowLane(pendingFix, options = {}) {
  const nowTimestamp = options.nowIsoDate ? Date.parse(options.nowIsoDate) : Date.now();
  const normalizedNowTimestamp = Number.isFinite(nowTimestamp) ? nowTimestamp : Date.now();
  const qualityTarget = typeof options.qualityTarget === 'number' && Number.isFinite(options.qualityTarget)
    ? options.qualityTarget
    : QUALITY_TARGET_SCORE;

  return [...pendingFix].sort((leftMergeRequest, rightMergeRequest) => {
    const leftScore = computeUrgencyScore(leftMergeRequest, qualityTarget, normalizedNowTimestamp);
    const rightScore = computeUrgencyScore(rightMergeRequest, qualityTarget, normalizedNowTimestamp);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    const leftTimestamp = getReferenceTimestamp(leftMergeRequest);
    const rightTimestamp = getReferenceTimestamp(rightMergeRequest);
    if (leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }

    const leftNumber = toNullableNumber(leftMergeRequest.mrNumber) ?? Number.MAX_SAFE_INTEGER;
    const rightNumber = toNullableNumber(rightMergeRequest.mrNumber) ?? Number.MAX_SAFE_INTEGER;
    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    const leftId = String(leftMergeRequest.id ?? '');
    const rightId = String(rightMergeRequest.id ?? '');
    return leftId.localeCompare(rightId);
  });
}
