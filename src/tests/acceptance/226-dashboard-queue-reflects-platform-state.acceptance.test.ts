/**
 * SPEC-226 — The dashboard queue reflects the real platform state
 *
 * Outer-loop acceptance test (SDD): a full sync (POST /api/mr-tracking/sync) reconciles the
 * tracked pull requests with their state on GitHub, then GET /api/mr-tracking shows the
 * reconciled buckets and the sync summary. Reproduces the practivizio-app measurement of
 * 2026-11-26: closed and merged pull requests still listed as "to fix" / "to approve".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/frameworks/logging/logBuffer.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

import Fastify, { type FastifyInstance } from 'fastify';

import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { mrTrackingRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.js';
import { mrTrackingAdvancedRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.js';
import { InMemorySyncSummaryGateway } from '@/modules/tracking/interface-adapters/gateways/syncSummary.memory.gateway.js';
import { ReconcileWithPlatformUseCase } from '@/modules/tracking/usecases/tracking/reconcileWithPlatform.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js';
import { StubReviewRequestStateFetchGateway } from '@/tests/stubs/reviewRequestStateFetch.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const localPath = '/home/user/practivizio-app';
const project = 'practicio/practivizio-app';
const syncedAt = new Date('2026-11-26T09:30:00.000Z');

interface Harness {
  app: FastifyInstance;
  trackingGateway: InMemoryReviewRequestTrackingGateway;
  platform: StubReviewRequestStateFetchGateway;
}

async function buildHarness(): Promise<Harness> {
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();
  const platform = new StubReviewRequestStateFetchGateway();
  const syncSummaryGateway = new InMemorySyncSummaryGateway();
  const reconcileWithPlatform = new ReconcileWithPlatformUseCase({
    trackingGateway,
    platform: 'github',
    reviewRequestStateFetchGateway: platform,
    syncSummaryGateway,
    now: () => syncedAt,
  });

  const app = Fastify();
  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: trackingGateway,
    reviewContextGateway: new StubReviewContextGateway(),
    getSyncSummary: (path) => syncSummaryGateway.get(path),
    cancelJob: () => false,
    buildJobId: () => 'job',
    removeWorktree: async () => ({ status: 'removed' }),
    logger: createStubLogger(),
  });
  await app.register(mrTrackingAdvancedRoutes, {
    getRepositories: () => [],
    reviewRequestTrackingGateway: trackingGateway,
    reviewContextGateway: {} as never,
    threadFetchGatewayFactory: () => ({ fetchThreads: () => [] }) as never,
    diffMetadataFetchGatewayFactory: () => ({}) as never,
    diffStatsFetchGatewayFactory: () => ({}) as never,
    createSyncThreadsUseCase: () => ({ execute: () => null }) as never,
    syncWithPlatform: (path) => reconcileWithPlatform.execute({ localPath: path, project }),
    recordReviewCompletion: { execute: vi.fn() } as never,
    enforceBudget: { execute: vi.fn() } as never,
    broadcastBudgetExceeded: vi.fn(),
    noteCommentPostGatewayFactory: () => new StubNoteCommentPostGateway(),
    logger: createStubLogger(),
  });

  return { app, trackingGateway, platform };
}

function track(harness: Harness, mrNumber: number, state: TrackedMr['state']): void {
  harness.trackingGateway.create(
    localPath,
    TrackedMrFactory.create({
      id: `github-${project}-${mrNumber}`,
      mrNumber,
      platform: 'github',
      project,
      state,
    }),
  );
}

interface QueueResponse {
  pendingFix: Array<{ mrNumber: number }>;
  pendingApproval: Array<{ mrNumber: number }>;
  merged: Array<{ mrNumber: number }>;
  closed: Array<{ mrNumber: number }>;
  sync: { syncedAt: string; removedClosed: number; untrackedOpen: number } | null;
}

async function fullSync(harness: Harness): Promise<number> {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/api/mr-tracking/sync',
    payload: { projectPath: localPath },
  });
  return response.statusCode;
}

async function readQueue(harness: Harness): Promise<QueueResponse> {
  const response = await harness.app.inject({
    method: 'GET',
    url: `/api/mr-tracking?path=${encodeURIComponent(localPath)}`,
  });
  return response.json();
}

function numbersOf(bucket: Array<{ mrNumber: number }>): number[] {
  return bucket.map((mr) => mr.mrNumber).sort((left, right) => left - right);
}

describe('SPEC-226 — dashboard queue reflects the real platform state', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await buildHarness();
  });

  it('moves a PR merged on GitHub out of the queue and into merged', async () => {
    track(harness, 1924, 'pending-approval');
    harness.platform.givenPlatformState(1924, 'merged');

    await fullSync(harness);
    const queue = await readQueue(harness);

    expect(numbersOf(queue.pendingApproval)).toEqual([]);
    expect(numbersOf(queue.merged)).toEqual([1924]);
  });

  it('moves a PR closed on GitHub out of the queue and into closed', async () => {
    track(harness, 1394, 'pending-fix');
    harness.platform.givenPlatformState(1394, 'closed');

    await fullSync(harness);
    const queue = await readQueue(harness);

    expect(numbersOf(queue.pendingFix)).toEqual([]);
    expect(numbersOf(queue.closed)).toEqual([1394]);
  });

  it('keeps a PR still open on GitHub in its bucket', async () => {
    track(harness, 1536, 'pending-approval');
    harness.platform.givenOpen(1536);

    await fullSync(harness);
    const queue = await readQueue(harness);

    expect(numbersOf(queue.pendingApproval)).toEqual([1536]);
  });

  it('exposes the sync summary with removed and untracked-open counts', async () => {
    track(harness, 1394, 'pending-fix');
    track(harness, 1435, 'pending-approval');
    track(harness, 1536, 'pending-approval');
    harness.platform
      .givenPlatformState(1394, 'merged')
      .givenPlatformState(1435, 'closed')
      .givenOpen(1536, 2001, 2002);

    const status = await fullSync(harness);
    const queue = await readQueue(harness);

    expect(status).toBe(200);
    expect(queue.sync).toEqual({
      syncedAt: '2026-11-26T09:30:00.000Z',
      removedClosed: 2,
      untrackedOpen: 2,
    });
  });

  it('reports no sync summary before the first sync', async () => {
    const queue = await readQueue(harness);

    expect(queue.sync).toBeNull();
  });
});
