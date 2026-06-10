import type { PersistedInsightsData } from '@/modules/statistics-insights/entities/insight/persistedInsightsData.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { MrTrackingData } from '@/modules/tracking/entities/tracking/mrTrackingData.js';
import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export interface EmberReadDataGateway {
  reviewScores(projectPath: string): Promise<ProjectStats | null>;
  insights(projectPath: string): Promise<PersistedInsightsData | null>;
  jobHistory(projectPath: string): Promise<MrTrackingData | null>;
  worktrees(): Promise<WorktreeEntry[]>;
}
