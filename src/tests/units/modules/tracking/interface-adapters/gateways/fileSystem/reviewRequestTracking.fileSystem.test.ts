import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ProjectStatsCalculator } from '@/modules/statistics-insights/interface-adapters/presenters/projectStats.calculator.js';
import { FileSystemReviewRequestTrackingGateway } from '@/modules/tracking/interface-adapters/gateways/fileSystem/reviewRequestTracking.fileSystem.js';
import { TrackedMrFactory, MrTrackingDataFactory } from '@/tests/factories/trackedMr.factory.js';

function trackingFilePath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'mr-tracking.json');
}

function writeRaw(projectPath: string, content: string): void {
  const filePath = trackingFilePath(projectPath);
  mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

describe('FileSystemReviewRequestTrackingGateway', () => {
  let projectPath: string;
  let gateway: FileSystemReviewRequestTrackingGateway;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'reviewflow-tracking-fs-'));
    gateway = new FileSystemReviewRequestTrackingGateway(new ProjectStatsCalculator());
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  describe('loadTracking', () => {
    it('returns null when the tracking file does not exist', () => {
      expect(gateway.loadTracking(projectPath)).toBeNull();
    });

    it('returns null when the tracking file contains malformed JSON', () => {
      writeRaw(projectPath, '{ not valid json');

      expect(gateway.loadTracking(projectPath)).toBeNull();
    });

    it('resets mrs to an empty array when persisted mrs is not an array', () => {
      writeRaw(
        projectPath,
        JSON.stringify({ mrs: 'corrupted', lastUpdated: '2024-01-01T00:00:00Z', stats: null }),
      );

      const result = gateway.loadTracking(projectPath);

      expect(result).not.toBeNull();
      expect(result?.mrs).toEqual([]);
    });

    it('fills empty stats when persisted stats is missing', () => {
      writeRaw(projectPath, JSON.stringify({ mrs: [], lastUpdated: '2024-01-01T00:00:00Z' }));

      const result = gateway.loadTracking(projectPath);

      expect(result?.stats).toEqual({
        totalMrs: 0,
        totalReviews: 0,
        totalFollowups: 0,
        averageReviewsPerMr: 0,
        averageTimeToApproval: null,
        topAssigners: [],
      });
    });

    it('round-trips data written through saveTracking', () => {
      const trackedMr = TrackedMrFactory.create({ id: 'mr-roundtrip' });
      const data = MrTrackingDataFactory.withMrs([trackedMr]);

      gateway.saveTracking(projectPath, data);
      const result = gateway.loadTracking(projectPath);

      expect(result).not.toBeNull();
      expect(result?.mrs).toHaveLength(1);
      expect(result?.mrs[0].id).toBe('mr-roundtrip');
    });
  });

  describe('saveTracking', () => {
    it('creates the .claude/reviews directory when it is missing', () => {
      const data = MrTrackingDataFactory.create();

      gateway.saveTracking(projectPath, data);

      expect(existsSync(trackingFilePath(projectPath))).toBe(true);
    });

    it('recomputes stats from the persisted MRs', () => {
      const reviewed = TrackedMrFactory.create({ id: 'mr-1', totalReviews: 2, totalFollowups: 1 });
      const data = MrTrackingDataFactory.withMrs([reviewed]);

      gateway.saveTracking(projectPath, data);
      const result = gateway.loadTracking(projectPath);

      expect(result?.stats.totalMrs).toBe(1);
      expect(result?.stats.totalReviews).toBe(2);
      expect(result?.stats.totalFollowups).toBe(1);
    });
  });

  describe('getById', () => {
    it('returns null when no tracking file exists', () => {
      expect(gateway.getById(projectPath, 'mr-1')).toBeNull();
    });

    it('returns null when the id is not found', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-known' }));

      expect(gateway.getById(projectPath, 'mr-unknown')).toBeNull();
    });

    it('returns the matching MR', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-found' }));

      expect(gateway.getById(projectPath, 'mr-found')?.id).toBe('mr-found');
    });
  });

  describe('getByNumber', () => {
    it('returns null when no tracking file exists', () => {
      expect(gateway.getByNumber(projectPath, 42, 'gitlab')).toBeNull();
    });

    it('returns null when number matches but platform differs', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ mrNumber: 42, platform: 'gitlab' }));

      expect(gateway.getByNumber(projectPath, 42, 'github')).toBeNull();
    });

    it('returns the matching MR by number and platform', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ mrNumber: 42, platform: 'gitlab' }));

      expect(gateway.getByNumber(projectPath, 42, 'gitlab')?.mrNumber).toBe(42);
    });
  });

  describe('create', () => {
    it('initializes tracking data when none exists yet', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'first' }));

      const result = gateway.loadTracking(projectPath);
      expect(result?.mrs).toHaveLength(1);
      expect(result?.stats.totalMrs).toBe(1);
    });

    it('appends to existing tracking data', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'first' }));
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'second' }));

      const result = gateway.loadTracking(projectPath);
      expect(result?.mrs).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('does nothing when no tracking file exists', () => {
      gateway.update(projectPath, 'mr-1', { state: 'merged' });

      expect(gateway.loadTracking(projectPath)).toBeNull();
    });

    it('does nothing when the id is not found', () => {
      gateway.create(
        projectPath,
        TrackedMrFactory.create({ id: 'mr-known', state: 'pending-review' }),
      );

      gateway.update(projectPath, 'mr-missing', { state: 'merged' });

      expect(gateway.getById(projectPath, 'mr-known')?.state).toBe('pending-review');
    });

    it('updates the matching MR fields', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-1', state: 'pending-review' }));

      gateway.update(projectPath, 'mr-1', { state: 'pending-fix' });

      expect(gateway.getById(projectPath, 'mr-1')?.state).toBe('pending-fix');
    });
  });

  describe('getByState', () => {
    it('returns empty array when no tracking file exists', () => {
      expect(gateway.getByState(projectPath, 'pending-fix')).toEqual([]);
    });

    it('returns MRs matching the state', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-1', state: 'pending-fix' }));
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-2', state: 'pending-review' }));

      const result = gateway.getByState(projectPath, 'pending-fix');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mr-1');
    });
  });

  describe('getActiveMrs', () => {
    it('returns empty array when no tracking file exists', () => {
      expect(gateway.getActiveMrs(projectPath)).toEqual([]);
    });

    it('excludes merged and closed MRs', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'active', state: 'pending-fix' }));
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'merged', state: 'merged' }));
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'closed', state: 'closed' }));

      const result = gateway.getActiveMrs(projectPath);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('active');
    });
  });

  describe('remove', () => {
    it('returns false when no tracking file exists', () => {
      expect(gateway.remove(projectPath, 'mr-1')).toBe(false);
    });

    it('returns false when the id is not found', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-known' }));

      expect(gateway.remove(projectPath, 'mr-unknown')).toBe(false);
    });

    it('removes the matching MR and returns true', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-remove' }));

      expect(gateway.remove(projectPath, 'mr-remove')).toBe(true);
      expect(gateway.getById(projectPath, 'mr-remove')).toBeNull();
    });
  });

  describe('archive', () => {
    it('returns false for unknown id', () => {
      expect(gateway.archive(projectPath, 'mr-unknown')).toBe(false);
    });

    it('retains the matching MR as closed instead of deleting it', () => {
      gateway.create(
        projectPath,
        TrackedMrFactory.create({ id: 'mr-archive', state: 'pending-fix' }),
      );

      expect(gateway.archive(projectPath, 'mr-archive')).toBe(true);
      expect(gateway.getById(projectPath, 'mr-archive')?.state).toBe('closed');
    });

    it('surfaces the archived MR through getByState("closed")', () => {
      gateway.create(
        projectPath,
        TrackedMrFactory.create({ id: 'mr-archive', state: 'pending-fix' }),
      );

      gateway.archive(projectPath, 'mr-archive');

      expect(gateway.getByState(projectPath, 'closed').map((mr) => mr.id)).toEqual(['mr-archive']);
    });
  });

  describe('recordReviewEvent', () => {
    it('does nothing when no tracking file exists', () => {
      gateway.recordReviewEvent(projectPath, 'mr-1', {
        type: 'review',
        timestamp: '2024-01-15T12:00:00Z',
        durationMs: 1000,
        score: 8,
        blocking: 1,
        warnings: 2,
        suggestions: 3,
        threadsClosed: 0,
        threadsOpened: 3,
        diffStats: null,
      });

      expect(gateway.loadTracking(projectPath)).toBeNull();
    });

    it('does nothing when the MR id is not found', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-known' }));

      gateway.recordReviewEvent(projectPath, 'mr-missing', {
        type: 'review',
        timestamp: '2024-01-15T12:00:00Z',
        durationMs: 1000,
        score: 8,
        blocking: 1,
        warnings: 2,
        suggestions: 3,
        threadsClosed: 0,
        threadsOpened: 3,
        diffStats: null,
      });

      expect(gateway.getById(projectPath, 'mr-known')?.reviews).toHaveLength(0);
    });

    it('records a review event and increments review counters', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-1' }));

      gateway.recordReviewEvent(projectPath, 'mr-1', {
        type: 'review',
        timestamp: '2024-01-15T12:00:00Z',
        durationMs: 60000,
        score: 8,
        blocking: 1,
        warnings: 2,
        suggestions: 3,
        threadsClosed: 0,
        threadsOpened: 3,
        diffStats: null,
      });

      const result = gateway.getById(projectPath, 'mr-1');
      expect(result?.totalReviews).toBe(1);
      expect(result?.totalFollowups).toBe(0);
      expect(result?.totalBlocking).toBe(1);
      expect(result?.totalWarnings).toBe(2);
      expect(result?.totalSuggestions).toBe(3);
      expect(result?.totalDurationMs).toBe(60000);
      expect(result?.lastReviewAt).toBe('2024-01-15T12:00:00Z');
    });

    it('records a followup event and increments followup counters', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ id: 'mr-1' }));

      gateway.recordReviewEvent(projectPath, 'mr-1', {
        type: 'followup',
        timestamp: '2024-01-16T12:00:00Z',
        durationMs: 30000,
        score: 9,
        blocking: 0,
        warnings: 1,
        suggestions: 0,
        threadsClosed: 2,
        threadsOpened: 0,
        diffStats: null,
      });

      const result = gateway.getById(projectPath, 'mr-1');
      expect(result?.totalFollowups).toBe(1);
      expect(result?.totalReviews).toBe(0);
    });
  });

  describe('recordPush', () => {
    it('returns null when no tracking file exists', () => {
      expect(gateway.recordPush(projectPath, 42, 'gitlab')).toBeNull();
    });

    it('returns null when the MR is not found', () => {
      gateway.create(projectPath, TrackedMrFactory.create({ mrNumber: 42, platform: 'gitlab' }));

      expect(gateway.recordPush(projectPath, 999, 'gitlab')).toBeNull();
    });

    it('updates lastPushAt and returns the MR', () => {
      gateway.create(
        projectPath,
        TrackedMrFactory.create({ mrNumber: 42, platform: 'gitlab', lastPushAt: null }),
      );

      const result = gateway.recordPush(projectPath, 42, 'gitlab');

      expect(result).not.toBeNull();
      expect(result?.lastPushAt).not.toBeNull();
    });
  });
});
