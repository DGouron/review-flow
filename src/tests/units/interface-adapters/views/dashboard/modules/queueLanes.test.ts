import { describe, expect, it } from 'vitest';
import { buildQueueLanesModel } from '@/interface-adapters/views/dashboard/modules/queueLanes.js';

describe('buildQueueLanesModel', () => {
  it('should split pending fix into now lane and needs-fix lane', () => {
    const pendingFix = [
      { id: 'mr-high', urgencyScore: 90 },
      { id: 'mr-mid', urgencyScore: 60 },
      { id: 'mr-low', urgencyScore: 20 },
    ];
    const pendingApproval = [{ id: 'mr-approve-1' }];

    const result = buildQueueLanesModel(pendingFix, pendingApproval);

    expect(result.nowLaneItem?.id).toBe('mr-high');
    expect(result.needsFixItems.map((mergeRequest) => mergeRequest.id)).toEqual(['mr-mid', 'mr-low']);
    expect(result.readyToApproveItems.map((mergeRequest) => mergeRequest.id)).toEqual(['mr-approve-1']);
  });

  it('should keep stable counters when lists are empty', () => {
    const result = buildQueueLanesModel([], []);

    expect(result.nowLaneCount).toBe(0);
    expect(result.needsFixCount).toBe(0);
    expect(result.readyToApproveCount).toBe(0);
  });

  it('should keep one pending fix item only in now lane', () => {
    const result = buildQueueLanesModel([{ id: 'mr-only' }], []);

    expect(result.nowLaneItem?.id).toBe('mr-only');
    expect(result.needsFixItems).toEqual([]);
    expect(result.nowLaneCount).toBe(1);
  });
});
