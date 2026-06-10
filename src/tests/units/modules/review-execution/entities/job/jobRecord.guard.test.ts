import { describe, it, expect } from 'vitest';

import { jobRecordGuard } from '@/modules/review-execution/entities/job/jobRecord.guard.js';
import { JobRecordFactory } from '@/tests/factories/jobRecord.factory.js';

describe('jobRecordGuard', () => {
  it('accepts a valid record', () => {
    const result = jobRecordGuard.safeParse(JobRecordFactory.create());

    expect(result.success).toBe(true);
  });

  it('rejects a record with negative durationMs', () => {
    const invalid = JobRecordFactory.create({ durationMs: -1 });

    const result = jobRecordGuard.safeParse(invalid);

    expect(result.success).toBe(false);
  });

  it('rejects a record with an unknown status', () => {
    const invalid = { ...JobRecordFactory.create(), status: 'unknown' };

    const result = jobRecordGuard.safeParse(invalid);

    expect(result.success).toBe(false);
  });

  it('rejects a record with a missing jobId', () => {
    const invalid = { ...JobRecordFactory.create(), jobId: '' };

    const result = jobRecordGuard.safeParse(invalid);

    expect(result.success).toBe(false);
  });

  it('accepts a record with exitReason set to null', () => {
    const result = jobRecordGuard.safeParse(JobRecordFactory.create({ exitReason: null }));

    expect(result.success).toBe(true);
  });

  it('accepts a record with exitReason set to a string', () => {
    const result = jobRecordGuard.safeParse(
      JobRecordFactory.create({ exitReason: 'claude exit code 1' }),
    );

    expect(result.success).toBe(true);
  });

  it('rejects a record where exitReason is missing', () => {
    const { exitReason: _ignored, ...withoutExitReason } = JobRecordFactory.create();

    const result = jobRecordGuard.safeParse(withoutExitReason);

    expect(result.success).toBe(false);
  });

  it('rejects a record with a non ISO-8601 completedAt', () => {
    const invalid = JobRecordFactory.create({ completedAt: 'yesterday' });

    const result = jobRecordGuard.safeParse(invalid);

    expect(result.success).toBe(false);
  });

  it('rejects a record with a non ISO-8601 startedAt', () => {
    const invalid = JobRecordFactory.create({ startedAt: '2026-05-25' });

    const result = jobRecordGuard.safeParse(invalid);

    expect(result.success).toBe(false);
  });
});
