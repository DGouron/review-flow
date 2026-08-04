/**
 * The platform label marking a merge request currently under automated review.
 * Not configurable in this iteration (spec 221).
 */
export const REVIEW_IN_PROGRESS_LABEL = 'review-in-progress';

/**
 * The neutral platform label stating that an automated review ran to completion
 * on a merge request. It carries no verdict: the pass/block judgement lives in the
 * posted report and the recorded stats (spec 222).
 */
export const REVIEW_DONE_LABEL = 'review-done';
