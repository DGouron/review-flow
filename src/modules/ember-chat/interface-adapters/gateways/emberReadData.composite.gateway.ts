import type { EmberReadDataGateway } from '@/modules/ember-chat/entities/emberTool/emberTool.gateway.js';
import type { InsightsGateway } from '@/modules/statistics-insights/entities/insight/insights.gateway.js';
import type { PersistedInsightsData } from '@/modules/statistics-insights/entities/insight/persistedInsightsData.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import type { MrTrackingData } from '@/modules/tracking/entities/tracking/mrTrackingData.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export interface EmberReadDataCompositeGatewayDependencies {
  statsGateway: StatsGateway;
  insightsGateway: InsightsGateway;
  trackingGateway: ReviewRequestTrackingGateway;
  worktreeGateway: WorktreeGateway;
}

export class EmberReadDataCompositeGateway implements EmberReadDataGateway {
  constructor(private readonly dependencies: EmberReadDataCompositeGatewayDependencies) {}

  async reviewScores(projectPath: string): Promise<ProjectStats | null> {
    return this.dependencies.statsGateway.loadProjectStats(projectPath);
  }

  async insights(projectPath: string): Promise<PersistedInsightsData | null> {
    return this.dependencies.insightsGateway.loadPersistedInsights(projectPath);
  }

  async jobHistory(projectPath: string): Promise<MrTrackingData | null> {
    return this.dependencies.trackingGateway.loadTracking(projectPath);
  }

  async worktrees(): Promise<WorktreeEntry[]> {
    return this.dependencies.worktreeGateway.list();
  }
}
