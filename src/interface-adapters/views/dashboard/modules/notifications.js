const MAX_RECENT_KEYS = 500;

/**
 * @returns {{ initialized: boolean, activeStatusById: Record<string, { status: string, jobType: string | null }>, seenRecentKeys: string[] }}
 */
export function createReviewNotificationState() {
  return {
    initialized: false,
    activeStatusById: {},
    seenRecentKeys: [],
  };
}

/**
 * @param {Record<string, unknown>} review
 * @returns {string}
 */
function getReviewIdentifier(review) {
  if (typeof review.id === 'string' && review.id.length > 0) return review.id;
  if (typeof review.filename === 'string' && review.filename.length > 0) return review.filename;
  if (typeof review.mrNumber === 'number') return String(review.mrNumber);
  return '';
}

/**
 * @param {Record<string, unknown>} review
 * @returns {string}
 */
function getRecentReviewKey(review) {
  const identifier = getReviewIdentifier(review);
  const timeMarker = typeof review.completedAt === 'string'
    ? review.completedAt
    : typeof review.date === 'string'
      ? review.date
      : typeof review.timestamp === 'string'
        ? review.timestamp
        : '';
  const typeMarker = typeof review.type === 'string'
    ? review.type
    : typeof review.jobType === 'string'
      ? review.jobType
      : '';
  return `${identifier}::${timeMarker}::${typeMarker}`;
}

/**
 * @param {Record<string, unknown>[]} activeReviews
 * @returns {Record<string, { status: string, jobType: string | null }>}
 */
function buildActiveStatusMap(activeReviews) {
  const activeStatusById = {};
  activeReviews.forEach((review) => {
    const identifier = getReviewIdentifier(review);
    if (!identifier) return;
    activeStatusById[identifier] = {
      status: typeof review.status === 'string' ? review.status : '',
      jobType: typeof review.jobType === 'string' ? review.jobType : null,
    };
  });
  return activeStatusById;
}

/**
 * @param {{ initialized: boolean, activeStatusById: Record<string, { status: string, jobType: string | null }>, seenRecentKeys: string[] }} state
 * @param {Record<string, unknown>[]} activeReviews
 * @param {Record<string, unknown>[]} recentReviews
 * @returns {{ nextState: { initialized: boolean, activeStatusById: Record<string, { status: string, jobType: string | null }>, seenRecentKeys: string[] }, notifications: Array<{ kind: string, review: Record<string, unknown> }> }}
 */
export function collectReviewNotifications(state, activeReviews, recentReviews) {
  const nextActiveStatusById = buildActiveStatusMap(activeReviews);
  const nextSeenRecentKeysSet = new Set(state.seenRecentKeys);
  const notifications = [];

  if (!state.initialized) {
    recentReviews.forEach((review) => nextSeenRecentKeysSet.add(getRecentReviewKey(review)));
    return {
      nextState: {
        initialized: true,
        activeStatusById: nextActiveStatusById,
        seenRecentKeys: Array.from(nextSeenRecentKeysSet).slice(-MAX_RECENT_KEYS),
      },
      notifications,
    };
  }

  activeReviews.forEach((review) => {
    const identifier = getReviewIdentifier(review);
    if (!identifier) return;
    const previousStatus = state.activeStatusById[identifier]?.status ?? '';
    const currentStatus = typeof review.status === 'string' ? review.status : '';
    const isRunningTransition = currentStatus === 'running' && previousStatus !== 'running';
    if (!isRunningTransition) return;

    const jobType = typeof review.jobType === 'string' ? review.jobType : '';
    notifications.push({
      kind: jobType === 'followup' ? 'followupStarted' : 'reviewStarted',
      review,
    });
  });

  recentReviews.forEach((review) => {
    const reviewKey = getRecentReviewKey(review);
    if (nextSeenRecentKeysSet.has(reviewKey)) return;
    nextSeenRecentKeysSet.add(reviewKey);

    const status = typeof review.status === 'string' ? review.status : '';
    if (status === 'failed') {
      notifications.push({ kind: 'reviewFailed', review });
      return;
    }

    const reviewType = typeof review.type === 'string'
      ? review.type
      : typeof review.jobType === 'string'
        ? review.jobType
        : '';
    notifications.push({
      kind: reviewType === 'followup' ? 'followupCompleted' : 'reviewCompleted',
      review,
    });
  });

  return {
    nextState: {
      initialized: true,
      activeStatusById: nextActiveStatusById,
      seenRecentKeys: Array.from(nextSeenRecentKeysSet).slice(-MAX_RECENT_KEYS),
    },
    notifications,
  };
}
