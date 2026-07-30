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

import Fastify from 'fastify';

import { invokeClaudeReview } from '@/claude/invoker.js';
import { enqueueReview } from '@/frameworks/queue/pQueueAdapter.js';
import { createEgressScanner } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import type { EgressScanConfig } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import { EgressScannedNoteCommentPostGateway } from '@/modules/platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import { mrTrackingAdvancedRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { StubEgressTraceGateway } from '@/tests/stubs/egressScan.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';

const SECRET = 'glpat-abcdefghij1234567890';
const MR_ID = 'gitlab-test-org/test-project-42';
const LOCAL_PATH = '/home/user/projects/test';

const redactConfig: EgressScanConfig = {
  secretShapeMode: 'redact',
  lengthMode: 'redact',
  outOfScopeMode: 'redact',
  maxBodyLength: 10000,
  redactionMarker: '[REDACTED]',
  truncationMarker: '…[TRUNCATED]',
};

const DEFAULT_REPO = {
  name: 'test',
  platform: 'gitlab' as const,
  localPath: LOCAL_PATH,
  remoteUrl: 'https://gitlab.com/test-org/test-project.git',
  skill: 'review',
  enabled: true,
};

function contextWithPublicOutput(): ReviewContext {
  return {
    version: '1.0',
    mergeRequestId: MR_ID,
    platform: 'gitlab',
    projectPath: 'test-org/test-project',
    mergeRequestNumber: 42,
    createdAt: '2026-07-30T10:00:00Z',
    threads: [
      { id: 'thread-1', file: 'src/app.ts', line: 3, status: 'open', body: 'blocking finding' },
    ],
    actions: [
      { type: 'THREAD_REPLY', threadId: 'thread-1', message: `still open, token ${SECRET}` },
      { type: 'POST_COMMENT', body: `## Follow-up\ntoken ${SECRET}` },
    ],
    progress: { phase: 'completed', currentStep: null },
  };
}

/**
 * Drives the real manual-followup processor: the production mock of enqueueReview
 * throws the processor away, which is exactly why this path went unscanned unnoticed.
 */
async function runManualFollowup(): Promise<{
  sink: StubNoteCommentPostGateway;
  rawCommands: string[];
}> {
  const sink = new StubNoteCommentPostGateway();
  const scannedGateway = new EgressScannedNoteCommentPostGateway(
    sink,
    createEgressScanner(redactConfig),
    new StubEgressTraceGateway(),
  );
  const rawCommands: string[] = [];

  vi.mocked(invokeClaudeReview).mockResolvedValue({
    success: true,
    cancelled: false,
    exitCode: 0,
    stdout: '[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:score=10]',
    stderr: '',
    durationMs: 10,
  } as never);

  const capturedProcessors: Array<(job: ReviewJob, signal: AbortSignal) => Promise<void>> = [];
  vi.mocked(enqueueReview).mockImplementation(async (_job, processor) => {
    capturedProcessors.push(processor);
    return true;
  });

  const app = Fastify();
  await app.register(mrTrackingAdvancedRoutes, {
    getRepositories: () => [DEFAULT_REPO],
    reviewRequestTrackingGateway: {
      getById: vi.fn(() => null),
      getByNumber: vi.fn(() =>
        TrackedMrFactory.create({
          id: MR_ID,
          mrNumber: 42,
          project: 'test-org/test-project',
          sourceBranch: 'feature/refresh',
          targetBranch: 'main',
        }),
      ),
      create: vi.fn(),
      update: vi.fn(),
      getByState: vi.fn(() => []),
      getActiveMrs: vi.fn(() => []),
      remove: vi.fn(() => true),
      archive: vi.fn(() => true),
      recordReviewEvent: vi.fn(),
      recordPush: vi.fn(() => null),
      loadTracking: vi.fn(() => null),
      saveTracking: vi.fn(),
    } as never,
    reviewContextGateway: {
      create: vi.fn(),
      read: vi.fn(() => contextWithPublicOutput()),
      updateProgress: vi.fn(),
    } as never,
    threadFetchGatewayFactory: () => ({ fetchThreads: vi.fn(() => []) }) as never,
    diffMetadataFetchGatewayFactory: () => ({ fetchDiffMetadata: vi.fn(() => undefined) }) as never,
    diffStatsFetchGatewayFactory: () => ({ fetchDiffStats: vi.fn(() => null) }) as never,
    createSyncThreadsUseCase: () => ({ execute: vi.fn() }) as never,
    recordReviewCompletion: { execute: vi.fn() } as never,
    enforceBudget: {
      execute: vi.fn(async () => ({
        accepted: true,
        status: {
          limitUsd: 200,
          consumedUsd: 0,
          remainingUsd: 200,
          percentUsed: 0,
          exceeded: false,
          periodStart: '2026-07-01T00:00:00.000Z',
        },
      })),
    } as never,
    broadcastBudgetExceeded: vi.fn(),
    noteCommentPostGatewayFactory: () => scannedGateway,
    commandExecutor: (command: string, args: string[]) => {
      rawCommands.push([command, ...args].join(' '));
    },
    logger: createStubLogger(),
  } as never);

  await app.inject({
    method: 'POST',
    url: '/api/mr-tracking/followup',
    payload: { mrId: MR_ID, projectPath: LOCAL_PATH },
  });

  const processor = capturedProcessors[0];
  if (!processor) {
    throw new Error('the followup was never enqueued with a processor');
  }
  await processor(
    {
      id: 'gitlab-followup-test-org/test-project-42',
      platform: 'gitlab',
      projectPath: 'test-org/test-project',
      localPath: LOCAL_PATH,
      mrNumber: 42,
      skill: 'review-followup',
      jobType: 'followup',
    } as ReviewJob,
    new AbortController().signal,
  );

  await app.close();
  return { sink, rawCommands };
}

describe('manual followup — public output goes through the scanned sink (SPEC-199)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redacts the follow-up report before it leaves the system', async () => {
    const { sink } = await runManualFollowup();

    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0].body).toContain('[REDACTED]');
    expect(sink.calls[0].body).not.toContain(SECRET);
  });

  it('redacts the thread reply and keeps it addressed to its thread', async () => {
    const { sink } = await runManualFollowup();

    expect(sink.threadReplies).toHaveLength(1);
    expect(sink.threadReplies[0].threadId).toBe('thread-1');
    expect(sink.threadReplies[0].body).toContain('[REDACTED]');
    expect(sink.threadReplies[0].body).not.toContain(SECRET);
  });

  it('never hands a secret to the raw CLI primitive', async () => {
    const { rawCommands } = await runManualFollowup();

    expect(rawCommands.filter((command) => command.includes(SECRET))).toHaveLength(0);
  });
});
