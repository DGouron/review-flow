/**
 * @param {{ status: number, reviewFiles: number, stats: number, mrTracking: number }} loadingState
 * @param {{ hasLoadedStatusOnce: boolean }} options
 * @returns {{ showGlobalLoading: boolean, isQuietRefresh: boolean }}
 */
export function getLoadingPresentation(loadingState, options) {
  const isLoading = Object.values(loadingState).some((value) => value > 0);
  if (!isLoading) {
    return {
      showGlobalLoading: false,
      isQuietRefresh: false,
    };
  }

  const hasHeavyRefresh = loadingState.reviewFiles > 0 || loadingState.stats > 0;
  const hasPollingRefresh = loadingState.status > 0 || loadingState.mrTracking > 0;
  const isQuietRefresh = options.hasLoadedStatusOnce && hasPollingRefresh && !hasHeavyRefresh;

  return {
    showGlobalLoading: !isQuietRefresh,
    isQuietRefresh,
  };
}

/**
 * @param {{ status: number, reviewFiles: number, stats: number, mrTracking: number }} loadingState
 * @param {{ hasLoadedStatusOnce: boolean }} options
 * @returns {string[]}
 */
export function getQuietRefreshSectionIdentifiers(loadingState, options) {
  const loadingPresentation = getLoadingPresentation(loadingState, options);
  if (!loadingPresentation.isQuietRefresh) {
    return [];
  }

  const sectionIdentifiers = [];
  if (loadingState.mrTracking > 0) {
    sectionIdentifiers.push('pending-fix-section');
  }
  if (loadingState.status > 0) {
    sectionIdentifiers.push(
      'active-reviews-section',
      'active-followups-section',
      'completed-reviews-section',
    );
  }
  return sectionIdentifiers;
}
