import { describe, it, expect } from 'vitest';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';
import {
  TrackedMrFactory,
  MrTrackingDataFactory,
} from '../../../factories/trackedMr.factory.js';

describe('ReviewRequestTrackingGateway', () => {
  describe('loadTracking', () => {
    it('should return null when no tracking data exists', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      const result = gateway.loadTracking('/some/project');

      expect(result).toBeNull();
    });

    it('should return saved tracking data', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackingData = MrTrackingDataFactory.create();

      gateway.saveTracking('/my/project', trackingData);
      const result = gateway.loadTracking('/my/project');

      expect(result).toEqual(trackingData);
    });
  });

  describe('getByNumber', () => {
    it('should return null when no tracking data exists', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      const result = gateway.getByNumber('/project', 42, 'gitlab');

      expect(result).toBeNull();
    });

    it('should find tracked MR by number and platform', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({ mrNumber: 42, platform: 'gitlab' });
      const trackingData = MrTrackingDataFactory.withMrs([trackedMr]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getByNumber('/my/project', 42, 'gitlab');

      expect(result).not.toBeNull();
      expect(result?.mrNumber).toBe(42);
      expect(result?.platform).toBe('gitlab');
    });

    it('should not find MR with wrong platform', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({ mrNumber: 42, platform: 'gitlab' });
      const trackingData = MrTrackingDataFactory.withMrs([trackedMr]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getByNumber('/my/project', 42, 'github');

      expect(result).toBeNull();
    });
  });

  describe('getById', () => {
    it('should find tracked MR by id', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({ id: 'mr-unique-123' });
      const trackingData = MrTrackingDataFactory.withMrs([trackedMr]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getById('/my/project', 'mr-unique-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('mr-unique-123');
    });

    it('should return null for unknown id', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({ id: 'mr-123' });
      const trackingData = MrTrackingDataFactory.withMrs([trackedMr]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getById('/my/project', 'unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should add new MR to tracking', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const newMr = TrackedMrFactory.create({ id: 'new-mr', mrNumber: 99 });

      gateway.create('/my/project', newMr);
      const result = gateway.getById('/my/project', 'new-mr');

      expect(result).toBeDefined();
      expect(result?.mrNumber).toBe(99);
    });

    it('should initialize tracking data if project has none', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const newMr = TrackedMrFactory.create();

      gateway.create('/new/project', newMr);
      const tracking = gateway.loadTracking('/new/project');

      expect(tracking).not.toBeNull();
      expect(tracking?.mrs).toHaveLength(1);
      expect(tracking?.stats.totalMrs).toBe(1);
    });
  });

  describe('update', () => {
    it('should update MR fields', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({
        id: 'mr-to-update',
        state: 'pending-review'
      });
      gateway.create('/my/project', trackedMr);

      gateway.update('/my/project', 'mr-to-update', { state: 'pending-fix' });
      const result = gateway.getById('/my/project', 'mr-to-update');

      expect(result?.state).toBe('pending-fix');
    });

    it('should not fail for unknown MR', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      expect(() => {
        gateway.update('/my/project', 'unknown', { state: 'merged' });
      }).not.toThrow();
    });
  });

  describe('recordReviewEvent', () => {
    it('should add review event and update stats', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({ id: 'mr-1' });
      gateway.create('/my/project', trackedMr);

      gateway.recordReviewEvent('/my/project', 'mr-1', {
        type: 'review',
        timestamp: '2024-01-15T12:00:00Z',
        durationMs: 60000,
        score: 8,
        blocking: 1,
        warnings: 2,
        suggestions: 3,
        threadsClosed: 0,
        threadsOpened: 3,
      });

      const result = gateway.getById('/my/project', 'mr-1');
      expect(result?.reviews).toHaveLength(1);
      expect(result?.totalReviews).toBe(1);
      expect(result?.totalBlocking).toBe(1);
      expect(result?.lastReviewAt).toBe('2024-01-15T12:00:00Z');
    });

    it('should track followup events separately', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({ id: 'mr-1' });
      gateway.create('/my/project', trackedMr);

      gateway.recordReviewEvent('/my/project', 'mr-1', {
        type: 'followup',
        timestamp: '2024-01-16T12:00:00Z',
        durationMs: 30000,
        score: 9,
        blocking: 0,
        warnings: 1,
        suggestions: 0,
        threadsClosed: 2,
        threadsOpened: 0,
      });

      const result = gateway.getById('/my/project', 'mr-1');
      expect(result?.totalFollowups).toBe(1);
      expect(result?.totalReviews).toBe(0);
    });
  });

  describe('getByState', () => {
    it('should return MRs matching the given state', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const pendingFix = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-fix' });
      const pendingReview = TrackedMrFactory.create({ id: 'mr-2', state: 'pending-review' });
      const anotherPendingFix = TrackedMrFactory.create({ id: 'mr-3', state: 'pending-fix' });
      const trackingData = MrTrackingDataFactory.withMrs([pendingFix, pendingReview, anotherPendingFix]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getByState('/my/project', 'pending-fix');

      expect(result).toHaveLength(2);
      expect(result.map((mr) => mr.id)).toEqual(['mr-1', 'mr-3']);
    });

    it('should return empty array when no MRs match', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const mr = TrackedMrFactory.create({ state: 'pending-review' });
      const trackingData = MrTrackingDataFactory.withMrs([mr]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getByState('/my/project', 'approved');

      expect(result).toEqual([]);
    });

    it('should return empty array when no tracking data exists', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      const result = gateway.getByState('/my/project', 'pending-fix');

      expect(result).toEqual([]);
    });
  });

  describe('getActiveMrs', () => {
    it('should return MRs that are not merged or closed', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const active = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-fix' });
      const merged = TrackedMrFactory.create({ id: 'mr-2', state: 'merged' });
      const closed = TrackedMrFactory.create({ id: 'mr-3', state: 'closed' });
      const trackingData = MrTrackingDataFactory.withMrs([active, merged, closed]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getActiveMrs('/my/project');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mr-1');
    });

    it('should return empty array when no tracking data exists', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      const result = gateway.getActiveMrs('/my/project');

      expect(result).toEqual([]);
    });
  });

  describe('remove', () => {
    it('should remove MR from tracking', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const mr = TrackedMrFactory.create({ id: 'mr-to-remove' });
      gateway.create('/my/project', mr);

      const removed = gateway.remove('/my/project', 'mr-to-remove');

      expect(removed).toBe(true);
      expect(gateway.getById('/my/project', 'mr-to-remove')).toBeNull();
    });

    it('should return false when MR does not exist', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      const removed = gateway.remove('/my/project', 'nonexistent');

      expect(removed).toBe(false);
    });

    it('should return false when no tracking data exists', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      const removed = gateway.remove('/unknown/project', 'mr-1');

      expect(removed).toBe(false);
    });
  });

  describe('archive', () => {
    it('should remove MR from active list', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const mr = TrackedMrFactory.create({ id: 'mr-to-archive' });
      gateway.create('/my/project', mr);

      const archived = gateway.archive('/my/project', 'mr-to-archive');

      expect(archived).toBe(true);
      expect(gateway.getById('/my/project', 'mr-to-archive')).toBeNull();
    });

    it('should return false when MR does not exist', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      const archived = gateway.archive('/my/project', 'nonexistent');

      expect(archived).toBe(false);
    });
  });

  describe('recordPush', () => {
    it('should update lastPushAt and return the MR', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({
        mrNumber: 42,
        platform: 'gitlab',
        lastPushAt: null
      });
      gateway.create('/my/project', trackedMr);

      const result = gateway.recordPush('/my/project', 42, 'gitlab');

      expect(result).not.toBeNull();
      expect(result?.lastPushAt).not.toBeNull();
    });

    it('should return null for unknown MR', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      const result = gateway.recordPush('/my/project', 999, 'gitlab');

      expect(result).toBeNull();
    });
  });
});
