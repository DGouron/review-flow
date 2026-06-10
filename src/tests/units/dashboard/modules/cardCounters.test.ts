import { describe, expect, it } from 'vitest';

import { computeCardCounters } from '@/dashboard/modules/cardCounters.js';

describe('computeCardCounters', () => {
  describe('overview scope', () => {
    it('should count all running and queued reviews globally', () => {
      const result = computeCardCounters({
        activeReviews: [
          { project: '/repo/A', status: 'running' },
          { project: '/repo/B', status: 'running' },
          { project: '/repo/A', status: 'queued' },
        ],
        reviewFiles: [],
        scope: { kind: 'overview' },
      });

      expect(result.running).toBe(2);
      expect(result.queued).toBe(1);
    });

    it('should use reviewFiles length as completed count', () => {
      const result = computeCardCounters({
        activeReviews: [],
        reviewFiles: [{}, {}, {}, {}, {}],
        scope: { kind: 'overview' },
      });

      expect(result.completed).toBe(5);
    });

    it('should return the overview marker label', () => {
      const result = computeCardCounters({
        activeReviews: [],
        reviewFiles: [],
        scope: { kind: 'overview' },
      });

      expect(result.markerLabel).toBe('TOUS LES PROJETS');
      expect(result.markerKind).toBe('overview');
    });
  });

  describe('project scope', () => {
    it('should filter running reviews by activeTabId localPath', () => {
      const result = computeCardCounters({
        activeReviews: [
          { project: '/repo/A', status: 'running' },
          { project: '/repo/B', status: 'running' },
          { project: '/repo/A', status: 'queued' },
        ],
        reviewFiles: [],
        scope: { kind: 'project', localPath: '/repo/A', projectName: 'A' },
      });

      expect(result.running).toBe(1);
      expect(result.queued).toBe(1);
    });

    it('should count multiple queued matches for the active project', () => {
      const result = computeCardCounters({
        activeReviews: [
          { project: '/repo/A', status: 'queued' },
          { project: '/repo/A', status: 'queued' },
          { project: '/repo/B', status: 'queued' },
        ],
        reviewFiles: [],
        scope: { kind: 'project', localPath: '/repo/A', projectName: 'A' },
      });

      expect(result.queued).toBe(2);
    });

    it('should use reviewFiles length as completed count for the active project', () => {
      const result = computeCardCounters({
        activeReviews: [],
        reviewFiles: [{}, {}],
        scope: { kind: 'project', localPath: '/repo/A', projectName: 'A' },
      });

      expect(result.completed).toBe(2);
    });

    it('should return uppercased projectName as marker label', () => {
      const result = computeCardCounters({
        activeReviews: [],
        reviewFiles: [],
        scope: { kind: 'project', localPath: '/repo/A', projectName: 'a' },
      });

      expect(result.markerLabel).toBe('A');
      expect(result.markerKind).toBe('project');
    });

    it('should return zero counts for empty project state', () => {
      const result = computeCardCounters({
        activeReviews: [],
        reviewFiles: [],
        scope: { kind: 'project', localPath: '/repo/empty', projectName: 'empty' },
      });

      expect(result.running).toBe(0);
      expect(result.queued).toBe(0);
      expect(result.completed).toBe(0);
    });
  });

  describe('defensive filtering', () => {
    it('should ignore statuses other than running and queued', () => {
      const result = computeCardCounters({
        activeReviews: [
          { project: '/repo/A', status: 'running' },
          { project: '/repo/A', status: 'cancelled' },
          { project: '/repo/A', status: 'completed' },
        ],
        reviewFiles: [],
        scope: { kind: 'overview' },
      });

      expect(result.running).toBe(1);
      expect(result.queued).toBe(0);
    });
  });
});

describe('extractGithubSlug', () => {
  it('extracts owner/repo from an https GitHub URL with .git suffix', async () => {
    const { extractGithubSlug } = await import('@/dashboard/modules/cardCounters.js');
    expect(extractGithubSlug('https://github.com/DGouron/review-flow.git')).toBe(
      'DGouron/review-flow',
    );
  });

  it('extracts owner/repo from an https GitHub URL without .git suffix', async () => {
    const { extractGithubSlug } = await import('@/dashboard/modules/cardCounters.js');
    expect(extractGithubSlug('https://github.com/DGouron/review-flow')).toBe('DGouron/review-flow');
  });

  it('extracts owner/repo from an ssh GitHub URL', async () => {
    const { extractGithubSlug } = await import('@/dashboard/modules/cardCounters.js');
    expect(extractGithubSlug('git@github.com:DGouron/review-flow.git')).toBe('DGouron/review-flow');
  });

  it('returns null for a GitLab URL', async () => {
    const { extractGithubSlug } = await import('@/dashboard/modules/cardCounters.js');
    expect(extractGithubSlug('https://gitlab.com/team/project.git')).toBe(null);
  });

  it('returns null for empty or invalid input', async () => {
    const { extractGithubSlug } = await import('@/dashboard/modules/cardCounters.js');
    expect(extractGithubSlug('')).toBe(null);
    expect(extractGithubSlug(undefined)).toBe(null);
    expect(extractGithubSlug(null)).toBe(null);
    expect(extractGithubSlug('not a url')).toBe(null);
  });
});

describe('computeCardCounters — aliases', () => {
  it('matches review.project against scope.localPath OR scope.aliases', async () => {
    const { computeCardCounters: cc } = await import('@/dashboard/modules/cardCounters.js');
    const result = cc({
      activeReviews: [
        { project: 'DGouron/review-flow', status: 'running' },
        { project: '/repo/A', status: 'queued' },
      ],
      reviewFiles: [],
      scope: {
        kind: 'project',
        localPath: '/repo/A',
        projectName: 'A',
        aliases: ['DGouron/review-flow'],
      },
    });
    expect(result.running).toBe(1);
    expect(result.queued).toBe(1);
  });

  it('falls back to localPath-only match when no aliases provided', async () => {
    const { computeCardCounters: cc } = await import('@/dashboard/modules/cardCounters.js');
    const result = cc({
      activeReviews: [{ project: 'DGouron/review-flow', status: 'running' }],
      reviewFiles: [],
      scope: { kind: 'project', localPath: '/repo/A', projectName: 'A' },
    });
    expect(result.running).toBe(0);
  });
});
