import { describe, expect, it } from 'vitest';

import { rankPendingFixForNowLane } from '@/dashboard/modules/priority.js';

describe('rankPendingFixForNowLane', () => {
  it('should rank items by urgency score', () => {
    const nowIsoDate = '2026-02-14T12:00:00.000Z';
    const pendingFix = [
      {
        id: 'older-low-threads',
        mrNumber: 10,
        openThreads: 2,
        reviews: [{ verdict: 'changes', grade: 'D' }],
        createdAt: '2026-02-13T08:00:00.000Z',
      },
      {
        id: 'fresh-many-threads',
        mrNumber: 11,
        openThreads: 4,
        reviews: [{ verdict: 'changes', grade: 'C' }],
        createdAt: '2026-02-14T11:00:00.000Z',
      },
      {
        id: 'ready-few-threads',
        mrNumber: 12,
        openThreads: 1,
        reviews: [{ verdict: 'ready', grade: 'B' }],
        createdAt: '2026-02-12T08:00:00.000Z',
      },
    ];

    const ranked = rankPendingFixForNowLane(pendingFix, { nowIsoDate });

    expect(ranked.map((mr) => mr.id)).toEqual([
      'fresh-many-threads',
      'older-low-threads',
      'ready-few-threads',
    ]);
  });

  it('should keep deterministic order when urgency score is identical', () => {
    const nowIsoDate = '2026-02-14T12:00:00.000Z';
    const pendingFix = [
      {
        id: 'newer',
        mrNumber: 32,
        openThreads: 2,
        reviews: [{ verdict: 'changes', grade: 'D' }],
        createdAt: '2026-02-14T10:00:00.000Z',
      },
      {
        id: 'older',
        mrNumber: 31,
        openThreads: 2,
        reviews: [{ verdict: 'changes', grade: 'D' }],
        createdAt: '2026-02-14T08:00:00.000Z',
      },
      {
        id: 'same-date-lower-number',
        mrNumber: 30,
        openThreads: 2,
        reviews: [{ verdict: 'changes', grade: 'D' }],
        createdAt: '2026-02-14T08:00:00.000Z',
      },
    ];

    const ranked = rankPendingFixForNowLane(pendingFix, { nowIsoDate });

    expect(ranked.map((mr) => mr.id)).toEqual(['same-date-lower-number', 'older', 'newer']);
  });

  it('should not mutate the input array', () => {
    const pendingFix = [
      {
        id: 'a',
        mrNumber: 10,
        openThreads: 1,
        reviews: [{ verdict: 'changes', grade: 'C' }],
        createdAt: '2026-02-14T10:00:00.000Z',
      },
      {
        id: 'b',
        mrNumber: 11,
        openThreads: 4,
        reviews: [{ verdict: 'changes', grade: 'D' }],
        createdAt: '2026-02-14T09:00:00.000Z',
      },
    ];
    const snapshot = pendingFix.map((mr) => mr.id);

    rankPendingFixForNowLane(pendingFix, { nowIsoDate: '2026-02-14T12:00:00.000Z' });

    expect(pendingFix.map((mr) => mr.id)).toEqual(snapshot);
  });

  it('should rank the worse grade first when threads and age are equal', () => {
    const nowIsoDate = '2026-02-14T12:00:00.000Z';
    const shared = { openThreads: 1, createdAt: '2026-02-14T10:00:00.000Z' };
    const pendingFix = [
      { ...shared, id: 'grade-c', mrNumber: 1, reviews: [{ verdict: 'changes', grade: 'C' }] },
      { ...shared, id: 'grade-d', mrNumber: 2, reviews: [{ verdict: 'changes', grade: 'D' }] },
      { ...shared, id: 'no-verdict', mrNumber: 3, reviews: [] },
    ];

    const ranked = rankPendingFixForNowLane(pendingFix, { nowIsoDate, targetGrade: 'B' });

    expect(ranked.map((mr) => mr.id)).toEqual(['grade-d', 'no-verdict', 'grade-c']);
  });
});
