import { DEFAULT_TARGET_GRADE } from './constants.js';
import { gradeRank, latestOutcomeOf } from './quality.js';

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
  const preferredDate =
    typeof mergeRequest.lastReviewAt === 'string'
      ? mergeRequest.lastReviewAt
      : typeof mergeRequest.createdAt === 'string'
        ? mergeRequest.createdAt
        : '';

  const parsedTimestamp = preferredDate ? Date.parse(preferredDate) : Number.NaN;
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : Number.MAX_SAFE_INTEGER;
}

/**
 * @param {Record<string, unknown>} mergeRequest
 * @param {'A' | 'B' | 'C' | 'D' | 'E'} targetGrade
 * @param {number} nowTimestamp
 * @returns {number}
 */
function computeUrgencyScore(mergeRequest, targetGrade, nowTimestamp) {
  const openThreads = toNullableNumber(mergeRequest.openThreads) ?? 0;
  const { grade } = latestOutcomeOf(mergeRequest);
  const referenceTimestamp = getReferenceTimestamp(mergeRequest);
  const ageHours =
    referenceTimestamp === Number.MAX_SAFE_INTEGER
      ? 0
      : Math.max(0, (nowTimestamp - referenceTimestamp) / HOUR_IN_MILLISECONDS);

  const threadScore = openThreads * 12;
  const qualityGap = grade === null ? 2 : Math.max(0, gradeRank(targetGrade) - gradeRank(grade));
  const qualityScore = qualityGap * 6;
  const ageScore = Math.min(12, ageHours * 0.2);

  return threadScore + qualityScore + ageScore;
}

/**
 * @param {Array<Record<string, unknown>>} pendingFix
 * @param {{ nowIsoDate?: string, targetGrade?: 'A' | 'B' | 'C' | 'D' | 'E' }} [options]
 * @returns {Array<Record<string, unknown>>}
 */
export function rankPendingFixForNowLane(pendingFix, options = {}) {
  const nowTimestamp = options.nowIsoDate ? Date.parse(options.nowIsoDate) : Date.now();
  const normalizedNowTimestamp = Number.isFinite(nowTimestamp) ? nowTimestamp : Date.now();
  const targetGrade = options.targetGrade ?? DEFAULT_TARGET_GRADE;

  return [...pendingFix].toSorted((leftMergeRequest, rightMergeRequest) => {
    const leftScore = computeUrgencyScore(leftMergeRequest, targetGrade, normalizedNowTimestamp);
    const rightScore = computeUrgencyScore(rightMergeRequest, targetGrade, normalizedNowTimestamp);

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
