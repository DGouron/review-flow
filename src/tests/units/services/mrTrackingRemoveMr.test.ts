import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { removeMrFromTracking, recomputeProjectStats, loadMrTracking } from '../../../services/mrTrackingService.js';
import type { MrTrackingData, TrackedMr } from '../../../services/mrTrackingService.js';

function createTrackedMr(overrides: Partial<TrackedMr> = {}): TrackedMr {
  const now = new Date().toISOString();
  return {
    id: 'gitlab-my-project-1',
    mrNumber: 1,
    title: 'Test MR',
    url: 'https://gitlab.com/my-project/-/merge_requests/1',
    project: 'my-project',
    platform: 'gitlab',
    sourceBranch: 'feature/test',
    targetBranch: 'main',
    assignment: { username: 'testuser', displayName: 'Test User', assignedAt: now },
    state: 'pending-fix',
    openThreads: 2,
    totalThreads: 5,
    createdAt: now,
    lastReviewAt: now,
    lastPushAt: null,
    approvedAt: null,
    mergedAt: null,
    reviews: [{
      type: 'review',
      timestamp: now,
      durationMs: 120000,
      score: 7,
      blocking: 1,
      warnings: 2,
      suggestions: 3,
      threadsClosed: 0,
      threadsOpened: 5,
    }],
    totalReviews: 1,
    totalFollowups: 0,
    totalBlocking: 1,
    totalWarnings: 2,
    totalSuggestions: 3,
    totalDurationMs: 120000,
    averageScore: 7,
    latestScore: 7,
    autoFollowup: true,
    ...overrides,
  };
}

function createTrackingData(mrs: TrackedMr[]): MrTrackingData {
  return {
    mrs,
    lastUpdated: new Date().toISOString(),
    stats: {
      totalMrs: mrs.length,
      totalReviews: mrs.reduce((sum, mr) => sum + mr.totalReviews, 0),
      totalFollowups: mrs.reduce((sum, mr) => sum + mr.totalFollowups, 0),
      averageReviewsPerMr: 0,
      averageTimeToApproval: null,
      topAssigners: [],
    },
  };
}

describe('removeMrFromTracking', () => {
  const testProjectPath = '/tmp/test-remove-mr-tracking';
  const trackingDir = join(testProjectPath, '.claude', 'reviews');
  const trackingFile = join(trackingDir, 'mr-tracking.json');

  beforeEach(() => {
    mkdirSync(trackingDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testProjectPath)) {
      rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  it('should remove an existing MR and return true', () => {
    const mr1 = createTrackedMr({ id: 'gitlab-project-1', mrNumber: 1 });
    const mr2 = createTrackedMr({ id: 'gitlab-project-2', mrNumber: 2 });
    writeFileSync(trackingFile, JSON.stringify(createTrackingData([mr1, mr2]), null, 2));

    const result = removeMrFromTracking(testProjectPath, 'gitlab-project-1');

    expect(result).toBe(true);
    const updated = loadMrTracking(testProjectPath);
    expect(updated.mrs).toHaveLength(1);
    expect(updated.mrs[0].id).toBe('gitlab-project-2');
  });

  it('should return false for non-existent MR', () => {
    const mr1 = createTrackedMr({ id: 'gitlab-project-1', mrNumber: 1 });
    writeFileSync(trackingFile, JSON.stringify(createTrackingData([mr1]), null, 2));

    const result = removeMrFromTracking(testProjectPath, 'gitlab-project-999');

    expect(result).toBe(false);
    expect(loadMrTracking(testProjectPath).mrs).toHaveLength(1);
  });

  it('should return false when tracking file does not exist', () => {
    rmSync(testProjectPath, { recursive: true, force: true });

    const result = removeMrFromTracking('/tmp/nonexistent-remove-mr', 'gitlab-project-1');

    expect(result).toBe(false);
  });
});

describe('recomputeProjectStats', () => {
  const testProjectPath = '/tmp/test-recompute-stats';
  const trackingDir = join(testProjectPath, '.claude', 'reviews');
  const trackingFile = join(trackingDir, 'mr-tracking.json');

  beforeEach(() => {
    mkdirSync(trackingDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testProjectPath)) {
      rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  it('should recalculate stats from remaining MRs', () => {
    const mr1 = createTrackedMr({ id: 'gitlab-project-1', totalReviews: 1, totalFollowups: 1 });
    const mr2 = createTrackedMr({ id: 'gitlab-project-2', totalReviews: 1, totalFollowups: 0 });
    writeFileSync(trackingFile, JSON.stringify(createTrackingData([mr1, mr2]), null, 2));

    recomputeProjectStats(testProjectPath);

    const updated = loadMrTracking(testProjectPath);
    expect(updated.stats.totalMrs).toBe(2);
    expect(updated.stats.totalReviews).toBe(2);
    expect(updated.stats.totalFollowups).toBe(1);
    expect(updated.stats.averageReviewsPerMr).toBeCloseTo(1.5);
  });

  it('should handle empty MR list (no MRs left)', () => {
    writeFileSync(trackingFile, JSON.stringify(createTrackingData([]), null, 2));

    recomputeProjectStats(testProjectPath);

    const updated = loadMrTracking(testProjectPath);
    expect(updated.stats.totalMrs).toBe(0);
    expect(updated.stats.totalReviews).toBe(0);
    expect(updated.stats.totalFollowups).toBe(0);
    expect(updated.stats.averageReviewsPerMr).toBe(0);
    expect(updated.stats.averageTimeToApproval).toBeNull();
  });

  it('should handle MRs with null scores', () => {
    const mr1 = createTrackedMr({
      id: 'gitlab-project-1',
      averageScore: null,
      latestScore: null,
      reviews: [{
        type: 'review',
        timestamp: new Date().toISOString(),
        durationMs: 100000,
        score: null,
        blocking: 1,
        warnings: 0,
        suggestions: 0,
        threadsClosed: 0,
        threadsOpened: 1,
      }],
    });
    const mr2 = createTrackedMr({ id: 'gitlab-project-2', totalReviews: 1 });
    writeFileSync(trackingFile, JSON.stringify(createTrackingData([mr1, mr2]), null, 2));

    recomputeProjectStats(testProjectPath);

    const updated = loadMrTracking(testProjectPath);
    expect(updated.stats.totalMrs).toBe(2);
    expect(updated.stats.totalReviews).toBe(2);
  });
});
