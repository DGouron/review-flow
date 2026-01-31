import { describe, it, expect, beforeEach } from 'vitest';
import { triggerReview, type TriggerReviewParams } from '../../../usecases/triggerReview.usecase.js';
import { StubReviewQueuePort } from '../../stubs/reviewQueue.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '../../stubs/reviewRequestTracking.stub.js';
import { createStubLogger } from '../../stubs/logger.stub.js';
import { TrackedMrFactory } from '../../factories/trackedMr.factory.js';

describe('triggerReview usecase', () => {
  let queuePort: StubReviewQueuePort;
  let trackingGateway: InMemoryReviewRequestTrackingGateway;

  const defaultParams: TriggerReviewParams = {
    platform: 'gitlab',
    projectPath: 'my-org/my-project',
    localPath: '/home/user/projects/my-project',
    reviewRequestNumber: 42,
    title: 'feat: add new feature',
    sourceBranch: 'feature/new-feature',
    targetBranch: 'main',
    mrUrl: 'https://gitlab.com/my-org/my-project/-/merge_requests/42',
    skill: 'review',
    assignedBy: { username: 'developer', displayName: 'Dev User' },
  };

  beforeEach(() => {
    queuePort = new StubReviewQueuePort();
    trackingGateway = new InMemoryReviewRequestTrackingGateway();
  });

  it('should enqueue job when no active review exists', () => {
    const result = triggerReview(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('success');
    expect(result).toHaveProperty('jobId');
    expect(queuePort.enqueuedJobs).toHaveLength(1);
    expect(queuePort.enqueuedJobs[0].mrNumber).toBe(42);
  });

  it('should deduplicate when review is already in progress', () => {
    const jobId = queuePort.createJobId('gitlab', 'my-org/my-project', 42);
    queuePort.addActiveJob(jobId);

    const result = triggerReview(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('deduplicated');
    expect(result).toHaveProperty('reason', 'Review already in progress');
    expect(queuePort.enqueuedJobs).toHaveLength(0);
  });

  it('should return failed when queue rejects job', () => {
    queuePort.shouldRejectEnqueue = true;

    const result = triggerReview(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('failed');
    expect(result).toHaveProperty('reason', 'Queue full or job rejected');
  });

  it('should record push in tracking gateway', () => {
    const trackedMr = TrackedMrFactory.create({
      mrNumber: 42,
      platform: 'gitlab',
      lastPushAt: null,
    });
    trackingGateway.create('/home/user/projects/my-project', trackedMr);

    triggerReview(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    const updated = trackingGateway.getByNumber(
      '/home/user/projects/my-project',
      42,
      'gitlab'
    );
    expect(updated?.lastPushAt).not.toBeNull();
  });

  it('should create followup job with correct prefix', () => {
    const followupParams: TriggerReviewParams = {
      ...defaultParams,
      jobType: 'followup',
    };

    const result = triggerReview(followupParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.jobId).toContain('gitlab-followup');
    }
    expect(queuePort.enqueuedJobs[0].jobType).toBe('followup');
  });

  it('should include job metadata in enqueued job', () => {
    triggerReview(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    const job = queuePort.enqueuedJobs[0];
    expect(job.title).toBe('feat: add new feature');
    expect(job.sourceBranch).toBe('feature/new-feature');
    expect(job.targetBranch).toBe('main');
    expect(job.assignedBy?.username).toBe('developer');
  });
});
