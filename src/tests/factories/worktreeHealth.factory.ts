import type {
  DegradedReason,
  WorktreeHealth,
} from '@/modules/worktree-management/entities/worktree/worktreeHealth.schema.js';

const DEFAULT_DETECTED_AT = new Date('2026-05-23T12:00:00.000Z');
const DEFAULT_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_AGE_MS = 26 * 60 * 60 * 1000;
const DEFAULT_LOCK_AGE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_LOCK_PATH = '/main/.git/worktrees/example/index.lock';

export class WorktreeHealthFactory {
  static healthy(): WorktreeHealth {
    return { status: 'healthy' };
  }

  static stale(overrides?: {
    ageMs?: number;
    thresholdMs?: number;
    detectedAt?: Date;
  }): WorktreeHealth {
    const reason: DegradedReason = {
      kind: 'stale',
      ageMs: overrides?.ageMs ?? DEFAULT_STALE_AGE_MS,
      thresholdMs: overrides?.thresholdMs ?? DEFAULT_STALE_THRESHOLD_MS,
    };
    return {
      status: 'degraded',
      reason,
      detectedAt: overrides?.detectedAt ?? DEFAULT_DETECTED_AT,
    };
  }

  static orphanLock(overrides?: {
    lockPath?: string;
    lockAgeMs?: number;
    detectedAt?: Date;
  }): WorktreeHealth {
    const reason: DegradedReason = {
      kind: 'orphan-git-lock',
      lockPath: overrides?.lockPath ?? DEFAULT_LOCK_PATH,
      lockAgeMs: overrides?.lockAgeMs ?? DEFAULT_LOCK_AGE_MS,
    };
    return {
      status: 'degraded',
      reason,
      detectedAt: overrides?.detectedAt ?? DEFAULT_DETECTED_AT,
    };
  }

  static unresolvedConflict(overrides?: { detectedAt?: Date }): WorktreeHealth {
    return {
      status: 'degraded',
      reason: { kind: 'unresolved-conflict' },
      detectedAt: overrides?.detectedAt ?? DEFAULT_DETECTED_AT,
    };
  }
}
