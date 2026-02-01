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
    it('should return undefined when no tracking data exists', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      const result = gateway.getByNumber('/project', 42, 'gitlab');

      expect(result).toBeUndefined();
    });

    it('should find tracked MR by number and platform', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({ mrNumber: 42, platform: 'gitlab' });
      const trackingData = MrTrackingDataFactory.withMrs([trackedMr]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getByNumber('/my/project', 42, 'gitlab');

      expect(result).toBeDefined();
      expect(result?.mrNumber).toBe(42);
      expect(result?.platform).toBe('gitlab');
    });

    it('should not find MR with wrong platform', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({ mrNumber: 42, platform: 'gitlab' });
      const trackingData = MrTrackingDataFactory.withMrs([trackedMr]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getByNumber('/my/project', 42, 'github');

      expect(result).toBeUndefined();
    });
  });

  describe('getById', () => {
    it('should find tracked MR by id', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({ id: 'mr-unique-123' });
      const trackingData = MrTrackingDataFactory.withMrs([trackedMr]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getById('/my/project', 'mr-unique-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('mr-unique-123');
    });

    it('should return undefined for unknown id', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();
      const trackedMr = TrackedMrFactory.create({ id: 'mr-123' });
      const trackingData = MrTrackingDataFactory.withMrs([trackedMr]);
      gateway.saveTracking('/my/project', trackingData);

      const result = gateway.getById('/my/project', 'unknown-id');

      expect(result).toBeUndefined();
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

      expect(result).toBeDefined();
      expect(result?.lastPushAt).not.toBeNull();
    });

    it('should return undefined for unknown MR', () => {
      const gateway = new InMemoryReviewRequestTrackingGateway();

      const result = gateway.recordPush('/my/project', 999, 'gitlab');

      expect(result).toBeUndefined();
    });
  });
});
