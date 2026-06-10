import type { EmberReadDataGateway } from '@/modules/ember-chat/entities/emberTool/emberTool.gateway.js';
import type { PersistedInsightsData } from '@/modules/statistics-insights/entities/insight/persistedInsightsData.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { MrTrackingData } from '@/modules/tracking/entities/tracking/mrTrackingData.js';
import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export class StubEmberReadDataGateway implements EmberReadDataGateway {
  private reviewScoresByProject = new Map<string, ProjectStats>();
  private insightsByProject = new Map<string, PersistedInsightsData>();
  private jobHistoryByProject = new Map<string, MrTrackingData>();
  private worktreeEntries: WorktreeEntry[] = [];

  setReviewScores(projectPath: string, stats: ProjectStats): void {
    this.reviewScoresByProject.set(projectPath, stats);
  }

  setInsights(projectPath: string, data: PersistedInsightsData): void {
    this.insightsByProject.set(projectPath, data);
  }

  setJobHistory(projectPath: string, data: MrTrackingData): void {
    this.jobHistoryByProject.set(projectPath, data);
  }

  setWorktrees(entries: WorktreeEntry[]): void {
    this.worktreeEntries = entries;
  }

  async reviewScores(projectPath: string): Promise<ProjectStats | null> {
    return this.reviewScoresByProject.get(projectPath) ?? null;
  }

  async insights(projectPath: string): Promise<PersistedInsightsData | null> {
    return this.insightsByProject.get(projectPath) ?? null;
  }

  async jobHistory(projectPath: string): Promise<MrTrackingData | null> {
    return this.jobHistoryByProject.get(projectPath) ?? null;
  }

  async worktrees(): Promise<WorktreeEntry[]> {
    return this.worktreeEntries;
  }
}
