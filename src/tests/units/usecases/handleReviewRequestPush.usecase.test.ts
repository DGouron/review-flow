import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleReviewRequestPush,
  type HandleReviewRequestPushParams,
} from '../../../usecases/handleReviewRequestPush.usecase.js';
import { StubReviewQueuePort } from '../../stubs/reviewQueue.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '../../stubs/reviewRequestTracking.stub.js';
import { createStubLogger } from '../../stubs/logger.stub.js';
import { TrackedMrFactory } from '../../factories/trackedMr.factory.js';

describe('handleReviewRequestPush usecase', () => {
  let queuePort: StubReviewQueuePort;
  let trackingGateway: InMemoryReviewRequestTrackingGateway;

  const defaultParams: HandleReviewRequestPushParams = {
    platform: 'gitlab',
    projectPath: 'my-org/my-project',
    localPath: '/home/user/projects/my-project',
    reviewRequestNumber: 42,
    skill: 'review-followup',
    mrUrl: 'https://gitlab.com/my-org/my-project/-/merge_requests/42',
  };

  beforeEach(() => {
    queuePort = new StubReviewQueuePort();
    trackingGateway = new InMemoryReviewRequestTrackingGateway();
  });

  it('should skip when review request is not tracked', () => {
    const result = handleReviewRequestPush(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.action).toBe('skipped');
    expect(result).toHaveProperty('reason', 'review-request-not-tracked');
  });

  it('should skip when no open threads', () => {
    const trackedMr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-fix',
      openThreads: 0,
    });
    trackingGateway.create('/home/user/projects/my-project', trackedMr);

    const result = handleReviewRequestPush(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.action).toBe('skipped');
    expect(result).toHaveProperty('reason', 'no-open-threads');
  });

  it('should skip when state is not pending-fix', () => {
    const trackedMr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-review',
      openThreads: 3,
    });
    trackingGateway.create('/home/user/projects/my-project', trackedMr);

    const result = handleReviewRequestPush(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.action).toBe('skipped');
    expect(result).toHaveProperty('reason', 'not-pending-fix');
  });

  it('should skip when review is already in progress', () => {
    const trackedMr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-fix',
      openThreads: 3,
    });
    trackingGateway.create('/home/user/projects/my-project', trackedMr);

    const jobId = queuePort.createJobId('gitlab-followup', 'my-org/my-project', 42);
    queuePort.addActiveJob(jobId);

    const result = handleReviewRequestPush(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.action).toBe('skipped');
    expect(result).toHaveProperty('reason', 'review-in-progress');
  });

  it('should trigger followup when conditions are met', () => {
    const trackedMr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-fix',
      openThreads: 3,
      title: 'Fix the bug',
      sourceBranch: 'fix/bug',
      targetBranch: 'main',
    });
    trackingGateway.create('/home/user/projects/my-project', trackedMr);

    const result = handleReviewRequestPush(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.action).toBe('followup-triggered');
    expect(result).toHaveProperty('jobId');
    expect(queuePort.enqueuedJobs).toHaveLength(1);
    expect(queuePort.enqueuedJobs[0].jobType).toBe('followup');
  });

  it('should use review request metadata for followup job', () => {
    const trackedMr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      state: 'pending-fix',
      openThreads: 2,
      title: 'Original MR title',
      sourceBranch: 'feature/x',
      targetBranch: 'develop',
    });
    trackingGateway.create('/home/user/projects/my-project', trackedMr);

    handleReviewRequestPush(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    const job = queuePort.enqueuedJobs[0];
    expect(job.title).toBe('Original MR title');
    expect(job.sourceBranch).toBe('feature/x');
    expect(job.targetBranch).toBe('develop');
  });
});
