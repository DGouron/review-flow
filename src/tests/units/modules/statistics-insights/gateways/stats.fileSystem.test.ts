import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { FileSystemStatsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

function statsPath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'stats.json');
}

function writeStatsFile(projectPath: string, content: string): void {
  const path = statsPath(projectPath);
  mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

describe('FileSystemStatsGateway (integration with real filesystem)', () => {
  let projectPath: string;
  let gateway: FileSystemStatsGateway;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'stats-fs-'));
    gateway = new FileSystemStatsGateway();
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  describe('loadProjectStats', () => {
    it('returns null when the stats file does not exist', () => {
      expect(gateway.loadProjectStats(projectPath)).toBeNull();
    });

    it('returns the parsed stats when the file is valid', () => {
      const stats = ProjectStatsFactory.withReviews([ReviewStatsFactory.create()]);
      writeStatsFile(projectPath, JSON.stringify(stats));

      const loaded = gateway.loadProjectStats(projectPath);

      expect(loaded).not.toBeNull();
      expect(loaded?.totalReviews).toBe(1);
      expect(loaded?.reviews).toHaveLength(1);
    });

    it('normalizes a missing reviews array to an empty array', () => {
      writeStatsFile(projectPath, JSON.stringify({ totalReviews: 0 }));

      const loaded = gateway.loadProjectStats(projectPath);

      expect(loaded?.reviews).toEqual([]);
    });

    it('returns null when the file content is malformed JSON', () => {
      writeStatsFile(projectPath, '{ not valid json');

      expect(gateway.loadProjectStats(projectPath)).toBeNull();
    });
  });

  describe('saveProjectStats', () => {
    it('creates the directory and writes the stats with a fresh lastUpdated', () => {
      const stats = ProjectStatsFactory.create({ lastUpdated: 'stale' });

      gateway.saveProjectStats(projectPath, stats);

      expect(existsSync(statsPath(projectPath))).toBe(true);
      const written = gateway.loadProjectStats(projectPath);
      expect(written?.lastUpdated).not.toBe('stale');
    });

    it('writes into an already-existing directory', () => {
      mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
      const stats = ProjectStatsFactory.withReviews([ReviewStatsFactory.create()]);

      gateway.saveProjectStats(projectPath, stats);

      const content = readFileSync(statsPath(projectPath), 'utf-8');
      expect(JSON.parse(content).totalReviews).toBe(1);
    });
  });

  describe('statsFileExists', () => {
    it('returns false when no stats file is present', () => {
      expect(gateway.statsFileExists(projectPath)).toBe(false);
    });

    it('returns true once a stats file has been saved', () => {
      gateway.saveProjectStats(projectPath, ProjectStatsFactory.create());

      expect(gateway.statsFileExists(projectPath)).toBe(true);
    });
  });
});
