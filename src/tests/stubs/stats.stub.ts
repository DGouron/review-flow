import type { StatsGateway } from '../../interface-adapters/gateways/stats.gateway.js';
import type { ProjectStats } from '../../services/statsService.js';

export class InMemoryStatsGateway implements StatsGateway {
  private storage = new Map<string, ProjectStats>();

  loadProjectStats(projectPath: string): ProjectStats | null {
    return this.storage.get(projectPath) ?? null;
  }

  saveProjectStats(projectPath: string, stats: ProjectStats): void {
    stats.lastUpdated = new Date().toISOString();
    this.storage.set(projectPath, stats);
  }

  statsFileExists(projectPath: string): boolean {
    return this.storage.has(projectPath);
  }

  clear(): void {
    this.storage.clear();
  }
}
