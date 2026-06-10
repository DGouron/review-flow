import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';

function getStatsPath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'stats.json');
}

export class FileSystemStatsGateway implements StatsGateway {
  loadProjectStats(projectPath: string): ProjectStats | null {
    const statsPath = getStatsPath(projectPath);

    if (!existsSync(statsPath)) {
      return null;
    }

    try {
      const content = readFileSync(statsPath, 'utf-8');
      const stats: ProjectStats = JSON.parse(content);

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
