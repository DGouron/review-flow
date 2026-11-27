import { describe, it, expect } from 'vitest';

import { tokenUsageRecordSchema } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';
import {
  roleTokenUsageRecordOf,
  tokenUsageRecordOf,
} from '@/modules/token-accounting/entities/tokenUsage/tokenUsageRecordOf.js';
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

  it('records the role of a role session, without a duration it cannot know', () => {
    const record = roleTokenUsageRecordOf({
      job,
      jobType: 'review',
      session,
      role: 'lot:securite',
      recordedAt: '2026-11-27T12:00:00.000Z',
    });

    expect(record).toMatchObject({ jobId: job.id, role: 'lot:securite', turns: 21 });
    expect(record.durationMs).toBeUndefined();
    expect(tokenUsageRecordSchema.parse(record).role).toBe('lot:securite');
  });

  it('rejects a record whose role is unknown', () => {
    const record = { ...TokenUsageRecordFactory.create(), role: 'lot:perf' };

    expect(tokenUsageRecordSchema.safeParse(record).success).toBe(false);
  });

  it('still reads a record written before sessions were recorded', () => {
    const olderRecord = TokenUsageRecordFactory.create();

    expect(tokenUsageRecordSchema.safeParse(olderRecord).success).toBe(true);
  });
});
