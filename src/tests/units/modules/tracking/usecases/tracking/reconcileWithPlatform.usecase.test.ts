import { beforeEach, describe, expect, it } from 'vitest';

import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { InMemorySyncSummaryGateway } from '@/modules/tracking/interface-adapters/gateways/syncSummary.memory.gateway.js';
import { ReconcileWithPlatformUseCase } from '@/modules/tracking/usecases/tracking/reconcileWithPlatform.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { StubReviewRequestStateFetchGateway } from '@/tests/stubs/reviewRequestStateFetch.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const localPath = '/home/user/app';
const project = 'acme/app';
const now = new Date('2026-11-26T10:00:00.000Z');

describe('ReconcileWithPlatformUseCase', () => {
  let trackingGateway: InMemoryReviewRequestTrackingGateway;
  let platform: StubReviewRequestStateFetchGateway;
  let syncSummaryGateway: InMemorySyncSummaryGateway;
  let reconcile: ReconcileWithPlatformUseCase;

  function track(mrNumber: number, overrides: Partial<TrackedMr> = {}): string {
    const id = overrides.id ?? `github-${project}-${mrNumber}`;
    trackingGateway.create(
      localPath,
      TrackedMrFactory.create({
        id,
        mrNumber,
        platform: 'github',
        project,
        state: 'pending-approval',
        ...overrides,
      }),
    );
    return id;
  }

  function stateOf(id: string): TrackedMr | null {
    return trackingGateway.getById(localPath, id);
  }

  beforeEach(() => {
    trackingGateway = new InMemoryReviewRequestTrackingGateway();
    platform = new StubReviewRequestStateFetchGateway();
    syncSummaryGateway = new InMemorySyncSummaryGateway();
    reconcile = new ReconcileWithPlatformUseCase({
      trackingGateway,
      platform: 'github',
      reviewRequestStateFetchGateway: platform,
      syncSummaryGateway,
      now: () => now,
    });
  });

  it('returns an empty summary when nothing is tracked nor open', () => {
    const summary = reconcile.execute({ localPath, project });

    expect(summary).toEqual({
      syncedAt: '2026-11-26T10:00:00.000Z',
      removedClosed: 0,
      untrackedOpen: 0,
    });
  });

  it('files a PR merged on the platform as merged with its merge date', () => {
    const id = track(1924);
    platform.givenPlatformState(1924, 'merged');

    reconcile.execute({ localPath, project });

    expect(stateOf(id)?.state).toBe('merged');
    expect(stateOf(id)?.mergedAt).toBe('2026-11-26T10:00:00.000Z');
  });

  it('files a PR closed on the platform as closed', () => {
    const id = track(1394, { state: 'pending-fix' });
    platform.givenPlatformState(1394, 'closed');

    reconcile.execute({ localPath, project });

    expect(stateOf(id)?.state).toBe('closed');
  });

  it('keeps a PR that is still open on the platform', () => {
    const id = track(1536);
    platform.givenOpen(1536);

    reconcile.execute({ localPath, project });

    expect(stateOf(id)?.state).toBe('pending-approval');
  });

  it('sets the platform author on a tracked PR that has none', () => {
    const id = track(1536, { author: null });
    platform.givenOpenBy(1536, { username: 'jdoe', displayName: 'Jane Doe' });

    reconcile.execute({ localPath, project });

    expect(stateOf(id)?.author).toEqual({ username: 'jdoe', displayName: 'Jane Doe' });
  });

  it('replaces a tracked author that is not the creator of the PR', () => {
    const id = track(1536, { author: { username: 'reviewer', displayName: null } });
    platform.givenOpenBy(1536, { username: 'jdoe', displayName: 'Jane Doe' });

    reconcile.execute({ localPath, project });

    expect(stateOf(id)?.author).toEqual({ username: 'jdoe', displayName: 'Jane Doe' });
  });

  it('only asks the platform about tracked PRs missing from the open list', () => {
    track(1536);
    track(1924);
    platform.givenOpen(1536).givenPlatformState(1924, 'merged');

    reconcile.execute({ localPath, project });

    expect(platform.fetchedNumbers).toEqual([1924]);
  });

  it('leaves already merged or closed PRs untouched', () => {
    const id = track(1000, { state: 'closed' });
    platform.givenPlatformState(1000, 'merged');

    const summary = reconcile.execute({ localPath, project });

    expect(stateOf(id)?.state).toBe('closed');
    expect(summary.removedClosed).toBe(0);
  });

  it('counts the PRs removed from the active buckets', () => {
    track(1394, { state: 'pending-fix' });
    track(1924);
    track(1536);
    platform.givenPlatformState(1394, 'closed').givenPlatformState(1924, 'merged').givenOpen(1536);

    const summary = reconcile.execute({ localPath, project });

    expect(summary.removedClosed).toBe(2);
  });

  it('does not count a PR reopened between the list and the state fetch', () => {
    const id = track(1700);
    platform.givenPlatformState(1700, 'open');
    platform.listOpen = () => [];

    const summary = reconcile.execute({ localPath, project });

    expect(stateOf(id)?.state).toBe('pending-approval');
    expect(summary.removedClosed).toBe(0);
  });

  it('counts the open PRs that are not actively tracked', () => {
    track(1536);
    track(1000, { state: 'closed' });
    platform.givenOpen(1536, 1000, 2001);

    const summary = reconcile.execute({ localPath, project });

    expect(summary.untrackedOpen).toBe(2);
  });

  it('ignores tracked review requests of another platform', () => {
    const id = track(7, { platform: 'gitlab', id: 'gitlab-acme/app-7' });

    reconcile.execute({ localPath, project });

    expect(stateOf(id)?.state).toBe('pending-approval');
    expect(platform.fetchedNumbers).toEqual([]);
  });

  it('saves the summary for the dashboard', () => {
    track(1924);
    platform.givenPlatformState(1924, 'merged');

    const summary = reconcile.execute({ localPath, project });

    expect(syncSummaryGateway.get(localPath)).toEqual(summary);
  });
});
