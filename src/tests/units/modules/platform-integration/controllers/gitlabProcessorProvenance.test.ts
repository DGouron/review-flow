import { vi } from 'vitest';

vi.mock('@/config/loader.js', () => ({
  loadConfig: vi.fn(() => ({ repositories: [] })),
  findRepositoryByProjectPath: vi.fn(() => undefined),
}));

vi.mock('@/claude/invoker.js', () => ({
  invokeClaudeReview: vi.fn(() =>
    Promise.resolve({
      success: true,
      stdout: '',
      durationMs: 1,
      exitCode: 0,
      cancelled: false,
      stderr: '',
    }),
  ),
  sendNotification: vi.fn(),
}));

vi.mock('@/main/websocket.js', () => ({
  startWatchingReviewContext: vi.fn(),
  stopWatchingReviewContext: vi.fn(),
}));

vi.mock('@/config/projectConfig.js', () => ({
  loadProjectConfig: vi.fn(() => null),
  getProjectAgents: vi.fn(() => null),
  getProjectAgentsOrFocusDefaults: vi.fn(() => null),
  getFollowupAgents: vi.fn(() => null),
  getProjectLanguage: vi.fn(() => 'en'),
}));

import { describe, it, expect } from 'vitest';

import { buildGitLabReviewProcessor } from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

class RecordingThreadFetch {
  public readonly calls: Array<{ projectPath: string; mrNumber: number }> = [];
  fetchThreads = (projectPath: string, mrNumber: number) => {
    this.calls.push({ projectPath, mrNumber });
    return [];
  };
}

function buildJob(): ReviewJob {
  return {
    id: 'gitlab-attacker/unknown-5',
    platform: 'gitlab',
    projectPath: 'attacker/unknown',
    localPath: '/repo',
    mrNumber: 5,
    skill: 'review-front',
    mrUrl: 'https://gitlab.com/attacker/unknown/-/merge_requests/5',
    sourceBranch: 'feature',
    targetBranch: 'main',
    jobType: 'review',
    language: 'en',
  } as unknown as ReviewJob;
}

describe('GitLab review processor provenance pin (AC9)', () => {
  it('AC9(1): an unconfigured projectPath never reaches fetchThreads (fail-closed)', async () => {
    const threadFetch = new RecordingThreadFetch();
    const processor = buildGitLabReviewProcessor(
      {
        reviewContextGateway: {
          create: () => undefined,
          read: () => null,
          updateProgress: () => undefined,
          setResult: () => undefined,
          delete: () => ({ deleted: true }),
        },
        threadFetchGateway: threadFetch,
        diffMetadataFetchGateway: { fetchDiffMetadata: () => undefined },
        diffStatsFetchGateway: { fetchDiffStats: () => null },
        recordCompletion: { execute: () => undefined },
        claudeInvokerDeps: undefined,
      } as never,
      createStubLogger(),
    );

    const job = buildJob();
    const run = processor(job);

    await expect(run(job, new AbortController().signal)).rejects.toThrow();
    expect(threadFetch.calls).toHaveLength(0);
  });
});
