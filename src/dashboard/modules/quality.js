export const QUALITY_GRADES = ['A', 'B', 'C', 'D', 'E'];

/**
 * @typedef {'ready' | 'changes' | 'stopped' | 'incomplete'} ReviewVerdict
 * @typedef {'A' | 'B' | 'C' | 'D' | 'E'} QualityGrade
 * @typedef {{ verdict: ReviewVerdict | null, grade: QualityGrade | null }} ReviewOutcome
 */

/** @type {ReviewOutcome} */
const NO_OUTCOME = { verdict: null, grade: null };

/**
 * @param {unknown} value
 * @returns {number}
 */
function countOf(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Mirrors the server: an event recorded before verdicts is read through its counts.
 *
 * @param {Record<string, unknown>} event
 * @returns {ReviewOutcome}
 */
export function outcomeOfReviewEvent(event) {
  if (event.verdict !== undefined) {
    return { verdict: event.verdict ?? null, grade: event.grade ?? null };
  }
  if (typeof event.score !== 'number') return NO_OUTCOME;
  const blocking = countOf(event.blocking);
  const warnings = countOf(event.warnings);
  const suggestions = countOf(event.suggestions);
  return {
    verdict: blocking > 0 || warnings > 0 ? 'changes' : 'ready',
    grade: blocking > 0 ? 'D' : warnings > 0 ? 'C' : suggestions > 0 ? 'B' : 'A',
  };
}

/**
 * @param {{ reviews?: Array<Record<string, unknown>> }} mergeRequest
 * @returns {ReviewOutcome}
 */
export function latestOutcomeOf(mergeRequest) {
  const reviews = Array.isArray(mergeRequest.reviews) ? mergeRequest.reviews : [];
  const latest = reviews.at(-1);
  return latest ? outcomeOfReviewEvent(latest) : NO_OUTCOME;
}

/**
 * @param {QualityGrade} grade
 * @returns {number}
 */
export function gradeRank(grade) {
  return QUALITY_GRADES.length - 1 - QUALITY_GRADES.indexOf(grade);
}

/**
 * @param {ReviewOutcome} outcome
 * @param {QualityGrade} targetGrade
 * @returns {'unknown' | 'excellent' | 'warning' | 'critical'}
 */
function stateOf(outcome, targetGrade) {
  if (outcome.verdict === null) return 'unknown';
  if (outcome.verdict === 'ready') {
    const withinTarget =
      outcome.grade === null || gradeRank(outcome.grade) >= gradeRank(targetGrade);
    return withinTarget ? 'excellent' : 'warning';
  }
  if (outcome.verdict === 'changes' && outcome.grade === 'C') return 'warning';
  return 'critical';
}

/**
 * @param {Array<Record<string, unknown>>} reviews
 * @returns {{ direction: 'up' | 'down' | 'flat' | 'unknown', label: string }}
 */
function trendOf(reviews) {
  const grades = reviews
    .map((review) => outcomeOfReviewEvent(review).grade)
    .filter((grade) => grade !== null)
    .slice(-2);
  if (grades.length < 2) return { direction: 'unknown', label: '' };

  const [previous, latest] = grades;
  const label = `${previous} → ${latest}`;
  const delta = gradeRank(latest) - gradeRank(previous);
  if (delta > 0) return { direction: 'up', label };
  if (delta < 0) return { direction: 'down', label };
  return { direction: 'flat', label };
}

/**
 * @param {{ reviews?: Array<Record<string, unknown>> }} mergeRequest
 * @param {QualityGrade} targetGrade
 */
export function qualityViewOf(mergeRequest, targetGrade) {
  const reviews = Array.isArray(mergeRequest.reviews) ? mergeRequest.reviews : [];
  const outcome = latestOutcomeOf(mergeRequest);
  return {
    verdict: outcome.verdict,
    grade: outcome.grade,
    targetGrade,
    state: stateOf(outcome, targetGrade),
    trend: trendOf(reviews),
  };
}
