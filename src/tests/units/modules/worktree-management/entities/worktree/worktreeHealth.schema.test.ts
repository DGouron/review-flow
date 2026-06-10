import { describe, it, expect } from 'vitest';

import {
  worktreeHealthSchema,
  degradedReasonSchema,
} from '@/modules/worktree-management/entities/worktree/worktreeHealth.schema.js';

describe('worktreeHealthSchema', () => {
  it('accepts a healthy status', () => {
    const result = worktreeHealthSchema.safeParse({ status: 'healthy' });

    expect(result.success).toBe(true);
  });

  it('accepts a degraded status with a stale reason and detectedAt', () => {
    const detectedAt = new Date('2026-05-23T12:00:00.000Z');
    const result = worktreeHealthSchema.safeParse({
      status: 'degraded',
      reason: { kind: 'stale', ageMs: 26 * 60 * 60 * 1000, thresholdMs: 24 * 60 * 60 * 1000 },
      detectedAt,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a degraded status without a reason', () => {
    const result = worktreeHealthSchema.safeParse({
      status: 'degraded',
      detectedAt: new Date(),
    });

    expect(result.success).toBe(false);
  });
});

describe('degradedReasonSchema', () => {
  it('accepts orphan-git-lock with lockPath and lockAgeMs', () => {
    const result = degradedReasonSchema.safeParse({
      kind: 'orphan-git-lock',
      lockPath: '/main/.git/worktrees/abc/index.lock',
      lockAgeMs: 2 * 60 * 60 * 1000,
    });

    expect(result.success).toBe(true);
  });

  it('accepts unresolved-conflict with just the kind discriminator', () => {
    const result = degradedReasonSchema.safeParse({ kind: 'unresolved-conflict' });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    const result = degradedReasonSchema.safeParse({ kind: 'unknown-disaster' });

    expect(result.success).toBe(false);
  });
});
