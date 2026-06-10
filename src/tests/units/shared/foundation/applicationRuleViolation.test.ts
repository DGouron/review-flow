import { describe, it, expect } from 'vitest';

import { ApplicationRuleViolation } from '@/shared/foundation/applicationRuleViolation.js';

class ReviewAlreadyRunning extends ApplicationRuleViolation {
  constructor(jobId: string) {
    super(`Review job ${jobId} is already running.`);
  }
}

describe('ApplicationRuleViolation', () => {
  it('is an instance of Error', () => {
    const violation = new ReviewAlreadyRunning('job-42');
    expect(violation).toBeInstanceOf(Error);
    expect(violation).toBeInstanceOf(ApplicationRuleViolation);
  });

  it('carries the subclass name and message', () => {
    const violation = new ReviewAlreadyRunning('job-42');
    expect(violation.name).toBe('ReviewAlreadyRunning');
    expect(violation.message).toBe('Review job job-42 is already running.');
  });

  it('is throwable and catchable as Error', () => {
    expect(() => {
      throw new ReviewAlreadyRunning('job-42');
    }).toThrow(Error);
  });
});
