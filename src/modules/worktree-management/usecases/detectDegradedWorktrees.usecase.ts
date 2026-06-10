import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type {
  WorktreeHealth,
  WorktreeHealthReport,
  DegradedReason,
} from '@/modules/worktree-management/entities/worktree/worktreeHealth.schema.js';
import type {
  HealthSignals,
  WorktreeHealthProbeGateway,
} from '@/modules/worktree-management/entities/worktree/worktreeHealthProbe.gateway.js';

export interface DetectDegradedWorktreesInput {
  entries: WorktreeEntry[];
  staleThresholdMs: number;
  now: () => Date;
}

export interface DetectDegradedWorktreesDependencies {
  healthProbe: WorktreeHealthProbeGateway;
}

function decideReason(
  signals: HealthSignals,
  staleThresholdMs: number,
  now: Date,
): DegradedReason | null {
  const ageMs = now.getTime() - signals.mtime.getTime();
  if (ageMs > staleThresholdMs) {
    return { kind: 'stale', ageMs, thresholdMs: staleThresholdMs };
  }
  if (signals.orphanLock?.present) {
    return {
      kind: 'orphan-git-lock',
      lockPath: signals.orphanLock.path,
      lockAgeMs: signals.orphanLock.ageMs,
    };
  }
  if (signals.unresolvedConflict) {
    return { kind: 'unresolved-conflict' };
  }
  return null;
}

export async function detectDegradedWorktrees(
  input: DetectDegradedWorktreesInput,
  deps: DetectDegradedWorktreesDependencies,
): Promise<WorktreeHealthReport[]> {
  const now = input.now();
  const reports: WorktreeHealthReport[] = [];

  for (const entry of input.entries) {
    const signals = await deps.healthProbe.probe(entry);
    const reason = decideReason(signals, input.staleThresholdMs, now);
    const health: WorktreeHealth =
      reason === null ? { status: 'healthy' } : { status: 'degraded', reason, detectedAt: now };
    reports.push({ entry, health });
  }

  return reports;
}
