import { describe, it, expect } from 'vitest';

import { tokenUsageRecordSchema } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';
import { tokenUsageRecordOf } from '@/modules/token-accounting/entities/tokenUsage/tokenUsageRecordOf.js';
import {
  TokenUsageFactory,
  TokenUsageRecordFactory,
} from '@/tests/factories/tokenUsage.factory.js';

describe('tokenUsageRecordOf', () => {
  const job = {
    id: 'github:Practic-IO/practivizio-app:2094',
    mrNumber: 2094,
    platform: 'github' as const,
    projectPath: 'Practic-IO/practivizio-app',
    localPath: '/Users/me/practivizio-app',
  };
  const session = {
    sessionId: '3334f6a3-e62c-477e-bb43-2ddf84195872',
    model: 'claude-opus-5-5',
    turns: 21,
    usage: TokenUsageFactory.create(),
  };

  it('records which session worked, on which kind of job, for how long and in how many turns', () => {
    const record = tokenUsageRecordOf({
      job,
      jobType: 'followup',
      session,
      durationMs: 240_000,
      recordedAt: '2026-11-25T14:48:20.000Z',
    });

    expect(record).toMatchObject({
      jobId: job.id,
      mrNumber: 2094,
      sessionId: session.sessionId,
      jobType: 'followup',
      durationMs: 240_000,
      turns: 21,
      model: 'claude-opus-5-5',
    });
    expect(tokenUsageRecordSchema.safeParse(record).success).toBe(true);
  });

  it('still reads a record written before sessions were recorded', () => {
    const olderRecord = TokenUsageRecordFactory.create();

    expect(tokenUsageRecordSchema.safeParse(olderRecord).success).toBe(true);
  });
});
