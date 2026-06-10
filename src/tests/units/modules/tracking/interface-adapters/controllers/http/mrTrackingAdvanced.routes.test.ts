import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/frameworks/queue/pQueueAdapter.js', () => ({
  enqueueReview: vi.fn(async () => true),
  createJobId: vi.fn(() => 'gitlab-followup-test-org/test-project-42'),
  updateJobProgress: vi.fn(),
}));

vi.mock('@/config/projectConfig.js', () => ({
  loadProjectConfig: vi.fn(() => null),
  getFollowupAgents: vi.fn(() => null),
}));

vi.mock('@/claude/invoker.js', () => ({
  invokeClaudeReview: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('@/main/websocket.js', () => ({
  startWatchingReviewContext: vi.fn(),
  stopWatchingReviewContext: vi.fn(),
}));

vi.mock('@/frameworks/logging/logBuffer.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

import Fastify, { type FastifyInstance } from 'fastify';

import { enqueueReview } from '@/frameworks/queue/pQueueAdapter.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { mrTrackingAdvancedRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.js';
import { TrackedMrFactory, MrTrackingDataFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

interface RepoStub {
  name: string;
  platform: 'gitlab' | 'github';
  localPath: string;
  remoteUrl: string;
  skill: string;
  enabled: boolean;
}

const DEFAULT_REPO: RepoStub = {
  name: 'test',
  platform: 'gitlab',
  localPath: '/home/user/projects/test',
  remoteUrl: 'https://gitlab.com/test-org/test-project.git',
  skill: 'review',
  enabled: true,
};

interface TrackingGatewayOverrides {
  getById?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  getByState?: ReturnType<typeof vi.fn>;
  getActiveMrs?: ReturnType<typeof vi.fn>;
  loadTracking?: ReturnType<typeof vi.fn>;
}

interface GateResult {
  status: 'enqueued' | 'pending' | 'rejected';
  jobId?: string;
  pendingId?: string;
  reason?: string;
}

interface BuildAppOptions {
  enforceBudgetAccepted: boolean;
  consumedUsd?: number;
  limitUsd?: number;
  trackedMr?: TrackedMr | null;
  repositories?: RepoStub[];
  tracking?: TrackingGatewayOverrides;
  createSyncThreadsExecute?: ReturnType<typeof vi.fn>;
  gateResult?: GateResult | null;
}

interface AppBundle {
  app: FastifyInstance;
  broadcastBudgetExceeded: ReturnType<typeof vi.fn>;
  enforceBudgetExecute: ReturnType<typeof vi.fn>;
  getByNumber: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  gateExecute: ReturnType<typeof vi.fn>;
}

async function buildApp(options: BuildAppOptions): Promise<AppBundle> {
  const consumedUsd = options.consumedUsd ?? 0;
  const limitUsd = options.limitUsd ?? 200;
  const broadcastBudgetExceeded = vi.fn();
  const enforceBudgetExecute = vi.fn(async () => ({
    accepted: options.enforceBudgetAccepted,
    status: {
      limitUsd,
      consumedUsd,
      remainingUsd: Math.max(0, limitUsd - consumedUsd),
      percentUsed: limitUsd === 0 ? 0 : (consumedUsd / limitUsd) * 100,
      exceeded: !options.enforceBudgetAccepted,
      periodStart: '2026-05-01T00:00:00.000Z',
    },
  }));

  const trackedMrValue = options.trackedMr === undefined ? null : options.trackedMr;
  const getByNumber = vi.fn(() => trackedMrValue);
  const tracking = options.tracking ?? {};
  const update = tracking.update ?? vi.fn();
  const gateExecute = vi.fn(async () => options.gateResult);
  const createSyncThreadsExecute = options.createSyncThreadsExecute ?? vi.fn();

  const app = Fastify();
  await app.register(mrTrackingAdvancedRoutes, {
    getRepositories: () => options.repositories ?? [DEFAULT_REPO],
    reviewRequestTrackingGateway: {
      getById: tracking.getById ?? vi.fn(() => null),
      getByNumber,
      create: vi.fn(),
      update,
      getByState: tracking.getByState ?? vi.fn(() => []),
      getActiveMrs: tracking.getActiveMrs ?? vi.fn(() => []),
      remove: vi.fn(() => true),
      archive: vi.fn(() => true),
      recordReviewEvent: vi.fn(),
      recordPush: vi.fn(() => null),
      loadTracking: tracking.loadTracking ?? vi.fn(() => null),
      saveTracking: vi.fn(),
    } as never,
    reviewContextGateway: {
      create: vi.fn(),
      read: vi.fn(() => null),
      updateProgress: vi.fn(),
    } as never,
    threadFetchGatewayFactory: () => ({ fetchThreads: vi.fn(() => []) }) as never,
    diffMetadataFetchGatewayFactory: () => ({ fetchDiffMetadata: vi.fn(() => undefined) }) as never,
    diffStatsFetchGatewayFactory: () => ({ fetchDiffStats: vi.fn(() => null) }) as never,
    createSyncThreadsUseCase: () => ({ execute: createSyncThreadsExecute }) as never,
    recordReviewCompletion: { execute: vi.fn() } as never,
    enforceBudget: { execute: enforceBudgetExecute } as never,
    broadcastBudgetExceeded,
    gateClaudeInvocation:
      options.gateResult == null ? undefined : ({ execute: gateExecute } as never),
    logger: createStubLogger(),
  });

  return { app, broadcastBudgetExceeded, enforceBudgetExecute, getByNumber, update, gateExecute };
}

describe('mrTrackingAdvancedRoutes POST /api/mr-tracking/followup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects with status=rejected and broadcasts budget-exceeded when enforceBudget refuses', async () => {
    const { app, broadcastBudgetExceeded, enforceBudgetExecute } = await buildApp({
      enforceBudgetAccepted: false,
      consumedUsd: 200.1,
      limitUsd: 200,
      trackedMr: TrackedMrFactory.create({
        id: 'gitlab-test-org/test-project-42',
        mrNumber: 42,
        project: 'test-org/test-project',
        sourceBranch: 'feature/refresh',
        targetBranch: 'main',
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: {
        mrId: 'gitlab-test-org/test-project-42',
        projectPath: '/home/user/projects/test',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'rejected', reason: 'budget-exceeded' });
    expect(enforceBudgetExecute).toHaveBeenCalled();
    expect(enqueueReview).not.toHaveBeenCalled();
    expect(broadcastBudgetExceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        mrNumber: 42,
        platform: 'gitlab',
        limitUsd: 200,
        consumedUsd: 200.1,
      }),
    );

    await app.close();
  });

  it('enqueues the followup with sourceBranch and targetBranch from TrackedMr when MR is tracked', async () => {
    const { app, broadcastBudgetExceeded, enforceBudgetExecute, getByNumber } = await buildApp({
      enforceBudgetAccepted: true,
      trackedMr: TrackedMrFactory.create({
        id: 'gitlab-test-org/test-project-42',
        mrNumber: 42,
        project: 'test-org/test-project',
        sourceBranch: 'feature/refresh',
        targetBranch: 'main',
      }),
    });

    await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: {
        mrId: 'gitlab-test-org/test-project-42',
        projectPath: '/home/user/projects/test',
      },
    });

    expect(getByNumber).toHaveBeenCalledWith('/home/user/projects/test', 42, 'gitlab');
    expect(enforceBudgetExecute).toHaveBeenCalled();
    expect(enqueueReview).toHaveBeenCalledTimes(1);
    const enqueuedJob = (enqueueReview as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(enqueuedJob).toMatchObject({
      mrNumber: 42,
      sourceBranch: 'feature/refresh',
      targetBranch: 'main',
      jobType: 'followup',
    });
    expect(broadcastBudgetExceeded).not.toHaveBeenCalled();

    await app.close();
  });

  it('rejects with 404 and does not enqueue when the MR is not tracked', async () => {
    const { app, enforceBudgetExecute } = await buildApp({
      enforceBudgetAccepted: true,
      trackedMr: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: {
        mrId: 'gitlab-test-org/test-project-42',
        projectPath: '/home/user/projects/test',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'MR not tracked' });
    expect(enforceBudgetExecute).not.toHaveBeenCalled();
    expect(enqueueReview).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 400 when mrId is missing', async () => {
    const { app, enforceBudgetExecute } = await buildApp({ enforceBudgetAccepted: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ success: false, error: 'mrId required' });
    expect(enforceBudgetExecute).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 400 when projectPath is missing', async () => {
    const { app } = await buildApp({ enforceBudgetAccepted: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { mrId: 'gitlab-test-org/test-project-42' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ success: false, error: 'projectPath required' });

    await app.close();
  });

  it('returns 400 when projectPath is not absolute', async () => {
    const { app } = await buildApp({ enforceBudgetAccepted: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { mrId: 'gitlab-test-org/test-project-42', projectPath: 'relative/path' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ success: false, error: 'Invalid path' });

    await app.close();
  });

  it('returns 400 when projectPath contains directory traversal', async () => {
    const { app } = await buildApp({ enforceBudgetAccepted: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { mrId: 'gitlab-test-org/test-project-42', projectPath: '/home/../etc' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ success: false, error: 'Invalid path' });

    await app.close();
  });

  it('returns 400 when mrId does not match the expected format', async () => {
    const { app } = await buildApp({ enforceBudgetAccepted: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { mrId: 'not-a-valid-id', projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ success: false, error: 'Invalid mrId format' });

    await app.close();
  });

  it('returns 404 when no enabled repository matches the projectPath', async () => {
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      repositories: [{ ...DEFAULT_REPO, enabled: false }],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { mrId: 'gitlab-test-org/test-project-42', projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'Repository not configured' });

    await app.close();
  });

  it('returns success=false when enqueueReview reports the review is already running', async () => {
    (enqueueReview as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      trackedMr: TrackedMrFactory.create({ id: 'gitlab-test-org/test-project-42', mrNumber: 42 }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { mrId: 'gitlab-test-org/test-project-42', projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: false,
      error: 'Review already in progress or recently performed',
    });

    await app.close();
  });

  it('returns pending-confirmation when gateClaudeInvocation parks the job', async () => {
    const { app, gateExecute } = await buildApp({
      enforceBudgetAccepted: true,
      trackedMr: TrackedMrFactory.create({ id: 'gitlab-test-org/test-project-42', mrNumber: 42 }),
      gateResult: { status: 'pending', pendingId: 'pending-1' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { mrId: 'gitlab-test-org/test-project-42', projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      status: 'pending-confirmation',
      pendingId: 'pending-1',
    });
    expect(gateExecute).toHaveBeenCalledTimes(1);
    expect(enqueueReview).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns success=false when gateClaudeInvocation rejects the job', async () => {
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      trackedMr: TrackedMrFactory.create({ id: 'gitlab-test-org/test-project-42', mrNumber: 42 }),
      gateResult: { status: 'rejected', reason: 'duplicate' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { mrId: 'gitlab-test-org/test-project-42', projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: false,
      error: 'Review already in progress or recently performed',
    });

    await app.close();
  });

  it('returns success with jobId when gateClaudeInvocation enqueues the job', async () => {
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      trackedMr: TrackedMrFactory.create({ id: 'gitlab-test-org/test-project-42', mrNumber: 42 }),
      gateResult: { status: 'enqueued', jobId: 'job-1' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { mrId: 'gitlab-test-org/test-project-42', projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      message: 'Followup review in progress',
    });

    await app.close();
  });

  it('resolves the github platform from the mrId prefix', async () => {
    const { app, getByNumber } = await buildApp({
      enforceBudgetAccepted: true,
      repositories: [
        {
          ...DEFAULT_REPO,
          platform: 'github',
          remoteUrl: 'https://github.com/test-org/test-project.git',
        },
      ],
      trackedMr: TrackedMrFactory.create({
        id: 'github-test-org/test-project-7',
        mrNumber: 7,
        platform: 'github',
      }),
    });

    await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: { mrId: 'github-test-org/test-project-7', projectPath: '/home/user/projects/test' },
    });

    expect(getByNumber).toHaveBeenCalledWith('/home/user/projects/test', 7, 'github');
    const enqueuedJob = (enqueueReview as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(enqueuedJob.platform).toBe('github');
    expect(enqueuedJob.mrUrl).toContain('/pull/7');

    await app.close();
  });
});

describe('mrTrackingAdvancedRoutes POST /api/mr-tracking/auto-followup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when mrId is missing', async () => {
    const { app } = await buildApp({ enforceBudgetAccepted: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/auto-followup',
      payload: { projectPath: '/home/user/projects/test', enabled: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ success: false, error: 'mrId requis' });

    await app.close();
  });

  it('returns 400 when enabled is not a boolean', async () => {
    const { app } = await buildApp({ enforceBudgetAccepted: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/auto-followup',
      payload: { mrId: 'gitlab-test-org/test-project-42', projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ success: false, error: 'enabled (boolean) requis' });

    await app.close();
  });

  it('returns 400 when projectPath is invalid', async () => {
    const { app } = await buildApp({ enforceBudgetAccepted: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/auto-followup',
      payload: { mrId: 'gitlab-test-org/test-project-42', projectPath: 'relative', enabled: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ success: false, error: 'Invalid path' });

    await app.close();
  });

  it('returns 404 when the MR is not found after update', async () => {
    const update = vi.fn();
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: { update, getById: vi.fn(() => null) },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/auto-followup',
      payload: {
        mrId: 'gitlab-test-org/test-project-42',
        projectPath: '/home/user/projects/test',
        enabled: true,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'MR non trouvée' });
    expect(update).toHaveBeenCalledWith(
      '/home/user/projects/test',
      'gitlab-test-org/test-project-42',
      {
        autoFollowup: true,
      },
    );

    await app.close();
  });

  it('returns success with the updated MR when toggling auto-followup', async () => {
    const mr = TrackedMrFactory.create({
      id: 'gitlab-test-org/test-project-42',
      autoFollowup: false,
    });
    const { app, update } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: { update: vi.fn(), getById: vi.fn(() => mr) },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/auto-followup',
      payload: {
        mrId: 'gitlab-test-org/test-project-42',
        projectPath: '/home/user/projects/test',
        enabled: false,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.mr.id).toBe('gitlab-test-org/test-project-42');
    expect(update).toHaveBeenCalledWith(
      '/home/user/projects/test',
      'gitlab-test-org/test-project-42',
      {
        autoFollowup: false,
      },
    );

    await app.close();
  });
});

describe('mrTrackingAdvancedRoutes POST /api/mr-tracking/followup-importants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when an explicit projectPath is invalid', async () => {
    const { app } = await buildApp({ enforceBudgetAccepted: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup-importants',
      payload: { projectPath: 'relative' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ success: false, error: 'Invalid path' });

    await app.close();
  });

  it('returns 404 when the explicit projectPath has no enabled repository', async () => {
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      repositories: [{ ...DEFAULT_REPO, enabled: false }],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup-importants',
      payload: { projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'Repository not configured' });

    await app.close();
  });

  it('returns triggered=0 with empty arrays when no pending-approval MR has warnings', async () => {
    const noWarnings = TrackedMrFactory.create({
      id: 'gitlab-test-org/test-project-1',
      totalWarnings: 0,
    });
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: { getByState: vi.fn(() => [noWarnings]) },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup-importants',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, triggered: 0, candidates: [], failed: [] });

    await app.close();
  });

  it('triggers candidates with warnings and reports successes via the internal followup route', async () => {
    const candidate = TrackedMrFactory.create({
      id: 'gitlab-test-org/test-project-42',
      mrNumber: 42,
      title: 'Important MR',
      totalWarnings: 3,
    });
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: { getByState: vi.fn(() => [candidate]) },
      trackedMr: candidate,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup-importants',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.triggered).toBe(1);
    expect(body.candidates).toEqual([
      { mrId: 'gitlab-test-org/test-project-42', mrNumber: 42, title: 'Important MR' },
    ]);
    expect(body.failed).toEqual([]);

    await app.close();
  });

  it('collects failures when the internal followup route reports success=false', async () => {
    const candidate = TrackedMrFactory.create({
      id: 'gitlab-test-org/test-project-42',
      mrNumber: 42,
      totalWarnings: 2,
    });
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: { getByState: vi.fn(() => [candidate]) },
      trackedMr: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup-importants',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.triggered).toBe(0);
    expect(body.failed).toEqual([
      { mrId: 'gitlab-test-org/test-project-42', error: 'MR not tracked' },
    ]);

    await app.close();
  });
});

describe('mrTrackingAdvancedRoutes POST /api/mr-tracking/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when projectPath is invalid', async () => {
    const { app } = await buildApp({ enforceBudgetAccepted: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/sync',
      payload: { projectPath: 'relative' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ success: false, error: 'Invalid path' });

    await app.close();
  });

  it('returns 404 when syncing a specific mrId that is not tracked', async () => {
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: { getById: vi.fn(() => null) },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/sync',
      payload: { projectPath: '/home/user/projects/test', mrId: 'gitlab-test-org/test-project-42' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'MR/PR not found' });

    await app.close();
  });

  it('returns the synced MR when a specific mrId resolves', async () => {
    const tracked = TrackedMrFactory.create({ id: 'gitlab-test-org/test-project-42' });
    const synced = TrackedMrFactory.create({
      id: 'gitlab-test-org/test-project-42',
      openThreads: 2,
      state: 'pending-approval',
    });
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: { getById: vi.fn(() => tracked) },
      createSyncThreadsExecute: vi.fn(() => synced),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/sync',
      payload: { projectPath: '/home/user/projects/test', mrId: 'gitlab-test-org/test-project-42' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.mr.openThreads).toBe(2);

    await app.close();
  });

  it('returns 404 when a specific mrId is tracked but the sync use case returns null', async () => {
    const tracked = TrackedMrFactory.create({ id: 'gitlab-test-org/test-project-42' });
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: { getById: vi.fn(() => tracked) },
      createSyncThreadsExecute: vi.fn(() => null),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/sync',
      payload: { projectPath: '/home/user/projects/test', mrId: 'gitlab-test-org/test-project-42' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'MR/PR not found' });

    await app.close();
  });

  it('syncs all active MRs and returns the loaded tracking list', async () => {
    const activeMr = TrackedMrFactory.create({ id: 'gitlab-test-org/test-project-1' });
    const trackingList = MrTrackingDataFactory.withMrs([activeMr]);
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: {
        getActiveMrs: vi.fn(() => [activeMr]),
        loadTracking: vi.fn(() => trackingList),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/sync',
      payload: { projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.mrs).toHaveLength(1);

    await app.close();
  });

  it('defaults to an empty list when loadTracking returns null', async () => {
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: { getActiveMrs: vi.fn(() => []), loadTracking: vi.fn(() => null) },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/sync',
      payload: { projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, mrs: [] });

    await app.close();
  });

  it('ignores individual MR sync failures while syncing all active MRs', async () => {
    const activeMr = TrackedMrFactory.create({ id: 'gitlab-test-org/test-project-1' });
    const failingSync = vi.fn(() => {
      throw new Error('sync boom');
    });
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: { getActiveMrs: vi.fn(() => [activeMr]), loadTracking: vi.fn(() => null) },
      createSyncThreadsExecute: failingSync,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/sync',
      payload: { projectPath: '/home/user/projects/test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, mrs: [] });

    await app.close();
  });

  it('returns 500 when getById throws while syncing a specific mrId', async () => {
    const { app } = await buildApp({
      enforceBudgetAccepted: true,
      tracking: {
        getById: vi.fn(() => {
          throw new Error('storage failure');
        }),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/sync',
      payload: { projectPath: '/home/user/projects/test', mrId: 'gitlab-test-org/test-project-42' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ success: false, error: 'storage failure' });

    await app.close();
  });
});
