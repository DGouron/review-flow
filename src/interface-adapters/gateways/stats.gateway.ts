import type { ProjectStats } from '../../services/statsService.js';

export interface StatsGateway {
  loadProjectStats(projectPath: string): ProjectStats | null;
  saveProjectStats(projectPath: string, stats: ProjectStats): void;
  statsFileExists(projectPath: string): boolean;
}
