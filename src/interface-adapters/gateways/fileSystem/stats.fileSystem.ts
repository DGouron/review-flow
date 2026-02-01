import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { StatsGateway } from '../stats.gateway.js';
import type { ProjectStats } from '../../../services/statsService.js';

function getStatsPath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'stats.json');
}

function createEmptyStats(): ProjectStats {
  return {
    totalReviews: 0,
    totalDuration: 0,
    averageScore: null,
    averageDuration: 0,
    totalBlocking: 0,
    totalWarnings: 0,
    reviews: [],
    lastUpdated: new Date().toISOString(),
  };
}

export class FileSystemStatsGateway implements StatsGateway {
  loadProjectStats(projectPath: string): ProjectStats | null {
    const statsPath = getStatsPath(projectPath);

    if (!existsSync(statsPath)) {
      return null;
    }

    try {
      const content = readFileSync(statsPath, 'utf-8');
      const stats = JSON.parse(content) as ProjectStats;

      if (!Array.isArray(stats.reviews)) {
        stats.reviews = [];
      }

      return stats;
    } catch {
      return null;
    }
  }

  saveProjectStats(projectPath: string, stats: ProjectStats): void {
    const statsPath = getStatsPath(projectPath);
    const dir = dirname(statsPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    stats.lastUpdated = new Date().toISOString();
    writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf-8');
  }

  statsFileExists(projectPath: string): boolean {
    return existsSync(getStatsPath(projectPath));
  }
}
