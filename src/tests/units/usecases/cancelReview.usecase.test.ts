import { describe, it, expect, beforeEach } from 'vitest';
import { cancelReview } from '../../../usecases/cancelReview.usecase.js';
import { StubReviewQueuePort } from '../../stubs/reviewQueue.stub.js';
import { createStubLogger } from '../../stubs/logger.stub.js';

describe('cancelReview usecase', () => {
  let queuePort: StubReviewQueuePort;

  beforeEach(() => {
    queuePort = new StubReviewQueuePort();
  });

  it('should return not-found when job does not exist', () => {
    const result = cancelReview('unknown-job-id', {
      queuePort,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('not-found');
    expect(result.jobId).toBe('unknown-job-id');
  });

  it('should return already-completed when job is completed', () => {
    queuePort.setJobStatus('job-123', 'completed');

    const result = cancelReview('job-123', {
      queuePort,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('already-completed');
    expect(result.jobId).toBe('job-123');
  });

  it('should return already-completed when job has failed', () => {
    queuePort.setJobStatus('job-123', 'failed');

    const result = cancelReview('job-123', {
      queuePort,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('already-completed');
    expect(result.jobId).toBe('job-123');
  });

  it('should cancel queued job', () => {
    queuePort.setJobStatus('job-123', 'queued');

    const result = cancelReview('job-123', {
      queuePort,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('cancelled');
    expect(result.jobId).toBe('job-123');
    expect(queuePort.cancelledJobs).toContain('job-123');
  });

  it('should cancel running job', () => {
    queuePort.setJobStatus('job-123', 'running');

    const result = cancelReview('job-123', {
      queuePort,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('cancelled');
    expect(result.jobId).toBe('job-123');
    expect(queuePort.cancelledJobs).toContain('job-123');
  });
});
