/**
 * @param {unknown} value
 * @returns {string | null}
 */
function toNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * @param {Record<string, unknown>} review
 * @returns {string | null}
 */
function getReviewAssigneeDisplay(review) {
  const assignedBy = review.assignedBy;
  if (!assignedBy || typeof assignedBy !== 'object') return null;

  return toNonEmptyString(assignedBy.displayName) ?? toNonEmptyString(assignedBy.username);
}

/**
 * @param {Record<string, unknown>} mergeRequest
 * @returns {string | null}
 */
function getMergeRequestAssigneeDisplay(mergeRequest) {
  const assignment = mergeRequest.assignment;
  if (!assignment || typeof assignment !== 'object') return null;

  return toNonEmptyString(assignment.displayName) ?? toNonEmptyString(assignment.username);
}

/**
 * @param {Record<string, unknown>} review
 * @param {Array<Record<string, unknown>>} trackedMergeRequests
 * @returns {string}
 */
export function resolveReviewAssigneeDisplay(review, trackedMergeRequests) {
  const reviewAssigneeDisplay = getReviewAssigneeDisplay(review);
  if (reviewAssigneeDisplay) return reviewAssigneeDisplay;

  if (typeof review.mrNumber !== 'number') return 'unknown';
  const matchingMergeRequest = trackedMergeRequests.find(
    (mergeRequest) => mergeRequest.mrNumber === review.mrNumber,
  );
  if (!matchingMergeRequest) return 'unknown';

  return getMergeRequestAssigneeDisplay(matchingMergeRequest) ?? 'unknown';
}
