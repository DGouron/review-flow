import { vi } from 'vitest';

vi.mock('@/frameworks/config/configLoader.js', () => ({
  loadConfig: vi.fn(() => ({
    queue: {
      maxConcurrent: 4,
      deduplicationWindowMs: 60000,
    },
  })),
}));

import { describe, it, expect, beforeEach } from 'vitest';

import {
  computeJobTimeoutMs,
  enqueueReview,
  initQueue,
  setJobTimeoutMs,
} from '@/frameworks/queue/pQueueAdapter.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

function createJob(overrides: Partial<ReviewJob>): ReviewJob {
  return {
    id: 'gitlab:test-org/test-project:42',
    platform: 'gitlab',
    projectPath: 'test-org/test-project',
    localPath: '/home/user/projects/test-project',
    mrNumber: 42,
    skill: 'review-front',
    mrUrl: 'https://gitlab.com/test-org/test-project/-/merge_requests/42',
    sourceBranch: 'feature/test',
    targetBranch: 'main',
    jobType: 'review',
    ...overrides,
  };
}

function nextTick(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

describe('pQueueAdapter - MR-scoped concurrency chain', () => {
  beforeEach(() => {
    initQueue(createStubLogger());
  });

  it('serializes two enqueues with the same MR key (different job ids)', async () => {
    const events: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstStarted = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const freshJob = createJob({ id: 'gitlab:test-org/test-project:42', jobType: 'review' });
    const followupJob = createJob({
      id: 'gitlab-followup:test-org/test-project:42',
      jobType: 'followup',
    });

    const freshEnqueued = await enqueueReview(freshJob, async () => {
      events.push('fresh:start');
      await firstStarted;
      events.push('fresh:end');
    });

    expect(freshEnqueued).toBe(true);

    const followupEnqueued = await enqueueReview(followupJob, async () => {
      events.push('followup:start');
      events.push('followup:end');
    });

    expect(followupEnqueued).toBe(true);

    await nextTick();
    await nextTick();
    expect(events).toEqual(['fresh:start']);

    releaseFirst();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(events).toEqual(['fresh:start', 'fresh:end', 'followup:start', 'followup:end']);
  });

  it('runs two enqueues with different MR keys in parallel (within queue concurrency)', async () => {
    const events: string[] = [];
    const releases: Array<() => void> = [];
    const waitForRelease = (index: number): Promise<void> =>
      new Promise<void>((resolve) => {
        releases[index] = resolve;
      });

    const jobA = createJob({
      id: 'gitlab:test-org/test-project:1',
      projectPath: 'test-org/test-project',
      mrNumber: 1,
    });
    const jobB = createJob({
      id: 'gitlab:test-org/other-project:2',
      projectPath: 'test-org/other-project',
      mrNumber: 2,
    });

    await enqueueReview(jobA, async () => {
      events.push('A:start');
      await waitForRelease(0);
      events.push('A:end');
    });

    await enqueueReview(jobB, async () => {
      events.push('B:start');
      await waitForRelease(1);
      events.push('B:end');
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(events).toContain('A:start');
    expect(events).toContain('B:start');

    releases[0]?.();
    releases[1]?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(events).toContain('A:end');
    expect(events).toContain('B:end');
  });

  it('cleans up the MR chain map after the tail completes (no leak)', async () => {
    const { __getMrChainsSize } = await import('@/frameworks/queue/pQueueAdapter.js');

    const job = createJob({
      id: 'gitlab:test-org/leak-check:99',
      projectPath: 'test-org/leak-check',
      mrNumber: 99,
    });

    await enqueueReview(job, async () => {});

    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(__getMrChainsSize()).toBe(0);
  });
});

describe('pQueueAdapter - SPEC-186 per-project concurrency cap', () => {
  beforeEach(async () => {
    initQueue(createStubLogger());
    const { __resetProjectConcurrencyState } = await import('@/frameworks/queue/pQueueAdapter.js');
    __resetProjectConcurrencyState();
  });

  it('exposes getRunningCount and getTotalCapacity that reflect setProjectConcurrencyCap', async () => {
    const { setProjectConcurrencyCap, getRunningCount, getTotalCapacity } =
      await import('@/frameworks/queue/pQueueAdapter.js');
    setProjectConcurrencyCap('/repos/A', 3);
    setProjectConcurrencyCap('/repos/B', 2);

    expect(getTotalCapacity()).toBe(5);
    expect(getRunningCount()).toBe(0);
  });

  it('queues a third review for a project capped at 2 while the first two run', async () => {
    const { setProjectConcurrencyCap, setGlobalConcurrency, getRunningCount } =
      await import('@/frameworks/queue/pQueueAdapter.js');
    setProjectConcurrencyCap('test-org/cap-2', 2);
    setGlobalConcurrency(10);

    const releases: Array<() => void> = [];
    const completed: string[] = [];

    const makeProcessor = (label: string) => async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      completed.push(label);
    };

    const jobA = createJob({
      id: 'gitlab:test-org/cap-2:1',
      projectPath: 'test-org/cap-2',
      mrNumber: 1,
    });
    const jobB = createJob({
      id: 'gitlab:test-org/cap-2:2',
      projectPath: 'test-org/cap-2',
      mrNumber: 2,
    });
    const jobC = createJob({
      id: 'gitlab:test-org/cap-2:3',
      projectPath: 'test-org/cap-2',
      mrNumber: 3,
    });

    await enqueueReview(jobA, makeProcessor('A'));
    await enqueueReview(jobB, makeProcessor('B'));
    await enqueueReview(jobC, makeProcessor('C'));

    await new Promise<void>((resolve) => setTimeout(resolve, 40));

    expect(getRunningCount()).toBe(2);
    expect(completed).toEqual([]);

    releases[0]?.();
    releases[1]?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 40));

    expect(completed.toSorted()).toEqual(['A', 'B']);
    expect(getRunningCount()).toBe(1);

    releases[2]?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 40));

    expect(completed.toSorted()).toEqual(['A', 'B', 'C']);
    expect(getRunningCount()).toBe(0);
  });
});

describe('pQueueAdapter - persist job record callback (SPEC-176)', () => {
  beforeEach(async () => {
    initQueue(createStubLogger());
    const { setPersistJobRecordCallback, replaceCompletedJobs } =
      await import('@/frameworks/queue/pQueueAdapter.js');
    setPersistJobRecordCallback(null);
    replaceCompletedJobs([]);
  });

  it('invokes the persist callback after a successful job with aborted=false', async () => {
    const { setPersistJobRecordCallback } = await import('@/frameworks/queue/pQueueAdapter.js');
    const recorded: { jobId: string; aborted: boolean }[] = [];
    setPersistJobRecordCallback(async (status, aborted) => {
      recorded.push({ jobId: status.job.id, aborted });
    });

    const job = createJob({ id: 'gitlab:cb-success:1', mrNumber: 1 });

    await enqueueReview(job, async () => {});

    await new Promise<void>((resolve) => setTimeout(resolve, 30));

    expect(recorded).toEqual([{ jobId: 'gitlab:cb-success:1', aborted: false }]);
  });

  it('invokes the persist callback after a failed job (does not break the queue)', async () => {
    const { setPersistJobRecordCallback } = await import('@/frameworks/queue/pQueueAdapter.js');
    const recorded: { jobId: string; status: string }[] = [];
    setPersistJobRecordCallback(async (status) => {
      recorded.push({ jobId: status.job.id, status: status.status });
    });

    const job = createJob({ id: 'gitlab:cb-failed:1', mrNumber: 1 });

    await enqueueReview(job, async () => {
      throw new Error('boom');
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 30));

    expect(recorded).toEqual([{ jobId: 'gitlab:cb-failed:1', status: 'failed' }]);
  });

  it('does not propagate a callback rejection back into the queue', async () => {
    const { setPersistJobRecordCallback } = await import('@/frameworks/queue/pQueueAdapter.js');
    setPersistJobRecordCallback(async () => {
      throw new Error('callback rejected');
    });

    const job = createJob({ id: 'gitlab:cb-throws:1', mrNumber: 1 });

    await expect(enqueueReview(job, async () => {})).resolves.toBe(true);

    await new Promise<void>((resolve) => setTimeout(resolve, 30));
  });
});

describe('pQueueAdapter - replaceCompletedJobs (SPEC-176)', () => {
  beforeEach(async () => {
    initQueue(createStubLogger());
    const { replaceCompletedJobs } = await import('@/frameworks/queue/pQueueAdapter.js');
    replaceCompletedJobs([]);
  });

  it('seeds the in-memory completed list, capped at 20', async () => {
    const { replaceCompletedJobs, getJobsStatus } =
      await import('@/frameworks/queue/pQueueAdapter.js');
    const records = Array.from({ length: 25 }, (_, index) => ({
      job: createJob({ id: `seed:${index}`, mrNumber: index }),
      status: 'completed' as const,
    }));

    replaceCompletedJobs(records);

    const snapshot = getJobsStatus();
    expect(snapshot.recent).toHaveLength(20);
    expect(snapshot.recent[0].id).toBe('seed:0');
  });

  it('clears the previous list before seeding', async () => {
    const { replaceCompletedJobs, getJobsStatus } =
      await import('@/frameworks/queue/pQueueAdapter.js');

    replaceCompletedJobs([{ job: createJob({ id: 'first', mrNumber: 1 }), status: 'completed' }]);
    replaceCompletedJobs([{ job: createJob({ id: 'second', mrNumber: 2 }), status: 'completed' }]);

    const snapshot = getJobsStatus();
    expect(snapshot.recent.map((entry) => entry.id)).toEqual(['second']);
  });
});

describe('pQueueAdapter - job timeout', () => {
  it('leaves a grace margin above the review session timeout', () => {
    expect(computeJobTimeoutMs(15 * 60 * 1000)).toBe(20 * 60 * 1000);
    expect(computeJobTimeoutMs(120 * 60 * 1000)).toBe(125 * 60 * 1000);
  });

  it('applies a new timeout to the live queue', () => {
    const queue = initQueue(createStubLogger());

    setJobTimeoutMs(90 * 60 * 1000);

    expect(queue.timeout).toBe(90 * 60 * 1000);
  });
});
