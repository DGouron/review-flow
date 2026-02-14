import { describe, expect, it } from 'vitest';
import {
  collectReviewNotifications,
  createReviewNotificationState,
} from '@/interface-adapters/views/dashboard/modules/notifications.js';

describe('collectReviewNotifications', () => {
  it('should stay silent on first initialization', () => {
    const result = collectReviewNotifications(
      createReviewNotificationState(),
      [{ id: 'r-1', status: 'running', jobType: 'review' }],
      [{ id: 'r-1', type: 'review', status: 'completed', completedAt: '2026-02-14T12:00:00Z' }],
    );

    expect(result.notifications).toEqual([]);
    expect(result.nextState.initialized).toBe(true);
  });

  it('should notify when a review starts running', () => {
    const initializedState = collectReviewNotifications(
      createReviewNotificationState(),
      [{ id: 'r-1', status: 'queued', jobType: 'review' }],
      [],
    ).nextState;

    const result = collectReviewNotifications(
      initializedState,
      [{ id: 'r-1', status: 'running', jobType: 'review', mrNumber: 42 }],
      [],
    );

    expect(result.notifications).toEqual([
      {
        kind: 'reviewStarted',
        review: { id: 'r-1', status: 'running', jobType: 'review', mrNumber: 42 },
      },
    ]);
  });

  it('should notify when a follow-up starts running', () => {
    const initializedState = collectReviewNotifications(
      createReviewNotificationState(),
      [{ id: 'f-1', status: 'queued', jobType: 'followup' }],
      [],
    ).nextState;

    const result = collectReviewNotifications(
      initializedState,
      [{ id: 'f-1', status: 'running', jobType: 'followup', mrNumber: 43 }],
      [],
    );

    expect(result.notifications[0]?.kind).toBe('followupStarted');
  });

  it('should notify when a completed review appears in recent list', () => {
    const initializedState = collectReviewNotifications(
      createReviewNotificationState(),
      [],
      [],
    ).nextState;

    const result = collectReviewNotifications(
      initializedState,
      [],
      [{ id: 'r-2', type: 'review', status: 'completed', completedAt: '2026-02-14T13:00:00Z', mrNumber: 51 }],
    );

    expect(result.notifications[0]?.kind).toBe('reviewCompleted');
  });

  it('should notify failed review as error event', () => {
    const initializedState = collectReviewNotifications(
      createReviewNotificationState(),
      [],
      [],
    ).nextState;

    const result = collectReviewNotifications(
      initializedState,
      [],
      [{ id: 'r-3', type: 'review', status: 'failed', completedAt: '2026-02-14T13:05:00Z' }],
    );

    expect(result.notifications[0]?.kind).toBe('reviewFailed');
  });
});
