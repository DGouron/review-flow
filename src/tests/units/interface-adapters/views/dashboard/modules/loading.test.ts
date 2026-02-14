import { describe, expect, it } from 'vitest';
import {
  getLoadingPresentation,
  getQuietRefreshSectionIdentifiers,
} from '@/interface-adapters/views/dashboard/modules/loading.js';

describe('getLoadingPresentation', () => {
  it('should show global loading for first status load', () => {
    const result = getLoadingPresentation(
      { status: 1, reviewFiles: 0, stats: 0, mrTracking: 0 },
      { hasLoadedStatusOnce: false },
    );

    expect(result).toEqual({
      showGlobalLoading: true,
      isQuietRefresh: false,
    });
  });

  it('should use quiet mode for polling-only refreshes once loaded', () => {
    const result = getLoadingPresentation(
      { status: 1, reviewFiles: 0, stats: 0, mrTracking: 1 },
      { hasLoadedStatusOnce: true },
    );

    expect(result).toEqual({
      showGlobalLoading: false,
      isQuietRefresh: true,
    });
  });

  it('should keep global loading for heavier data refreshes', () => {
    const result = getLoadingPresentation(
      { status: 1, reviewFiles: 1, stats: 0, mrTracking: 1 },
      { hasLoadedStatusOnce: true },
    );

    expect(result).toEqual({
      showGlobalLoading: true,
      isQuietRefresh: false,
    });
  });

  it('should disable all loading indicators when there is no loading source', () => {
    const result = getLoadingPresentation(
      { status: 0, reviewFiles: 0, stats: 0, mrTracking: 0 },
      { hasLoadedStatusOnce: true },
    );

    expect(result).toEqual({
      showGlobalLoading: false,
      isQuietRefresh: false,
    });
  });
});

describe('getQuietRefreshSectionIdentifiers', () => {
  it('should return MR tracking section for quiet MR refresh', () => {
    const result = getQuietRefreshSectionIdentifiers(
      { status: 0, reviewFiles: 0, stats: 0, mrTracking: 1 },
      { hasLoadedStatusOnce: true },
    );

    expect(result).toEqual(['pending-fix-section']);
  });

  it('should return review sections for quiet status refresh', () => {
    const result = getQuietRefreshSectionIdentifiers(
      { status: 1, reviewFiles: 0, stats: 0, mrTracking: 0 },
      { hasLoadedStatusOnce: true },
    );

    expect(result).toEqual([
      'active-reviews-section',
      'active-followups-section',
      'completed-reviews-section',
    ]);
  });

  it('should return no section when not in quiet mode', () => {
    const result = getQuietRefreshSectionIdentifiers(
      { status: 1, reviewFiles: 1, stats: 0, mrTracking: 0 },
      { hasLoadedStatusOnce: true },
    );

    expect(result).toEqual([]);
  });
});
