import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  setAutoFollowup,
  loadMrTracking,
  trackMrAssignment,
  saveMrTracking,
} from '../../../services/mrTrackingService.js';
import { TrackedMrFactory, MrTrackingDataFactory } from '../../factories/trackedMr.factory.js';

describe('autoFollowup toggle', () => {
  const projectPath = '/tmp/test-auto-followup';
  const trackingDir = join(projectPath, '.claude', 'reviews');
  const trackingPath = join(trackingDir, 'mr-tracking.json');

  beforeEach(() => {
    mkdirSync(trackingDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  function writeTrackingData(data: Parameters<typeof saveMrTracking>[1]) {
    writeFileSync(trackingPath, JSON.stringify(data, null, 2));
  }

  describe('TrackedMr autoFollowup default value', () => {
    it('should default autoFollowup to true when creating a new tracked MR', () => {
      const trackedMr = trackMrAssignment(
        projectPath,
        {
          mrNumber: 42,
          title: 'Test MR',
          url: 'https://gitlab.com/test/-/merge_requests/42',
          project: 'test/project',
          platform: 'gitlab',
          sourceBranch: 'feature',
          targetBranch: 'main',
        },
        { username: 'tester' }
      );

      expect(trackedMr.autoFollowup).toBe(true);
    });

    it('should treat legacy MRs without autoFollowup field as true', () => {
      const legacyMr = TrackedMrFactory.create({
        id: 'gitlab-test/project-10',
        mrNumber: 10,
      });
      // Simulate legacy data without autoFollowup field
      const rawData = MrTrackingDataFactory.withMrs([legacyMr]);
      const rawJson = JSON.parse(JSON.stringify(rawData));
      for (const mr of rawJson.mrs) {
        delete mr.autoFollowup;
      }
      writeFileSync(trackingPath, JSON.stringify(rawJson, null, 2));

      const loaded = loadMrTracking(projectPath);
      expect(loaded.mrs[0].autoFollowup).toBe(true);
    });
  });

  describe('setAutoFollowup', () => {
    it('should set autoFollowup to false for an existing MR', () => {
      const existingMr = TrackedMrFactory.create({
        id: 'gitlab-test/project-42',
        autoFollowup: true,
      });
      writeTrackingData(MrTrackingDataFactory.withMrs([existingMr]));

      const result = setAutoFollowup(projectPath, 'gitlab-test/project-42', false);

      expect(result).not.toBeNull();
      expect(result?.autoFollowup).toBe(false);

      const reloaded = loadMrTracking(projectPath);
      expect(reloaded.mrs[0].autoFollowup).toBe(false);
    });

    it('should set autoFollowup to true for an existing MR', () => {
      const existingMr = TrackedMrFactory.create({
        id: 'gitlab-test/project-42',
        autoFollowup: false,
      });
      writeTrackingData(MrTrackingDataFactory.withMrs([existingMr]));

      const result = setAutoFollowup(projectPath, 'gitlab-test/project-42', true);

      expect(result).not.toBeNull();
      expect(result?.autoFollowup).toBe(true);

      const reloaded = loadMrTracking(projectPath);
      expect(reloaded.mrs[0].autoFollowup).toBe(true);
    });

    it('should return null for a non-existent MR', () => {
      writeTrackingData(MrTrackingDataFactory.create());

      const result = setAutoFollowup(projectPath, 'gitlab-nonexistent-99', true);

      expect(result).toBeNull();
    });
  });
});
