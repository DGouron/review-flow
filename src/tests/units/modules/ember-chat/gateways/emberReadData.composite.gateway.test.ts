import { describe, it, expect } from 'vitest';

import { EmberReadDataCompositeGateway } from '@/modules/ember-chat/interface-adapters/gateways/emberReadData.composite.gateway.js';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import { createWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryInsightsGateway } from '@/tests/stubs/insights.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

class StubWorktreeGateway implements WorktreeGateway {
  constructor(private readonly entries: WorktreeEntry[]) {}
  async ensure(): Promise<never> {
    throw new Error('not used');
  }
  async remove(): Promise<never> {
    throw new Error('not used');
  }
  async list(): Promise<WorktreeEntry[]> {
    return this.entries;
  }
  async exists(): Promise<boolean> {
    return false;
  }
}

const PROJECT_PATH = '/projects/alpha';

function buildComposite(): {
  composite: EmberReadDataCompositeGateway;
  stats: InMemoryStatsGateway;
} {
  const stats = new InMemoryStatsGateway();
  const insights = new InMemoryInsightsGateway();
  const tracking = new InMemoryReviewRequestTrackingGateway();
  const worktree = new StubWorktreeGateway([]);
  const composite = new EmberReadDataCompositeGateway({
    statsGateway: stats,
    insightsGateway: insights,
    trackingGateway: tracking,
    worktreeGateway: worktree,
  });
  return { composite, stats };
}

describe('EmberReadDataCompositeGateway', () => {
  it('delegates reviewScores to the existing stats gateway', async () => {
    const { composite, stats } = buildComposite();
    const projectStats = ProjectStatsFactory.withReviews([
      ReviewStatsFactory.create({ mrNumber: 42, score: 3 }),
    ]);
    stats.saveProjectStats(PROJECT_PATH, projectStats);

    const result = await composite.reviewScores(PROJECT_PATH);

    expect(result?.reviews[0].mrNumber).toBe(42);
  });

  it('returns null review scores when no stats exist for the project', async () => {
    const { composite } = buildComposite();

    const result = await composite.reviewScores('/projects/unknown');

    expect(result).toBeNull();
  });

  it('delegates worktrees to the existing worktree gateway list', async () => {
    const stats = new InMemoryStatsGateway();
    const insights = new InMemoryInsightsGateway();
    const tracking = new InMemoryReviewRequestTrackingGateway();
    const entry: WorktreeEntry = {
      identity: { platform: 'github', projectPath: PROJECT_PATH, mrNumber: 7 },
      path: createWorktreePath('/worktrees/alpha-7'),
      mtime: new Date('2026-05-28T10:00:00Z'),
    };
    const composite = new EmberReadDataCompositeGateway({
      statsGateway: stats,
      insightsGateway: insights,
      trackingGateway: tracking,
      worktreeGateway: new StubWorktreeGateway([entry]),
    });

    const result = await composite.worktrees();

    expect(result).toHaveLength(1);
    expect(result[0].identity.mrNumber).toBe(7);
  });
});
