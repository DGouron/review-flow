import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type {
  RemoveResult,
  WorktreeEntry,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 7 * ONE_DAY_MS;

export interface SweepTrackingGateway {
  getById(projectPath: string, mrId: string): TrackedMr | null;
}

export interface SweepRepository {
  localPath: string;
  enabled: boolean;
}

export interface SweepStaleWorktreesDependencies {
  listEntries: () => Promise<WorktreeEntry[]>;
  removeWorktree: (identity: WorktreeIdentity) => Promise<RemoveResult>;
  trackingGateway: SweepTrackingGateway;
  getRepositories: () => SweepRepository[];
  now: () => Date;
}

export interface SweepSummary {
  scanned: number;
  removed: number;
  failures: number;
}

function buildTrackedMrId(identity: WorktreeIdentity): string {
  return `${identity.platform}-${identity.projectPath}-${identity.mrNumber}`;
}

function findTrackedMr(
  identity: WorktreeIdentity,
  trackingGateway: SweepTrackingGateway,
  repositories: SweepRepository[],
): TrackedMr | null {
  const mrId = buildTrackedMrId(identity);
  for (const repository of repositories) {
    if (!repository.enabled) continue;
    const tracked = trackingGateway.getById(repository.localPath, mrId);
    if (tracked) return tracked;
  }
  return null;
}

function isClosedOrMergedOverThreshold(tracked: TrackedMr, now: Date): boolean {
  if (tracked.state !== 'merged' && tracked.state !== 'closed') return false;
  const mergedAt = tracked.mergedAt;
  if (mergedAt === null) return true;
  const mergedTime = Date.parse(mergedAt);
  if (!Number.isFinite(mergedTime)) return true;
  return now.getTime() - mergedTime > ONE_DAY_MS;
}

function isStale(entry: WorktreeEntry, now: Date): boolean {
  return now.getTime() - entry.mtime.getTime() > STALE_THRESHOLD_MS;
}

export async function sweepStaleWorktrees(
  deps: SweepStaleWorktreesDependencies,
): Promise<SweepSummary> {
  const entries = await deps.listEntries();
  const repositories = deps.getRepositories();
  const now = deps.now();

  let removedCount = 0;
  let failures = 0;

  for (const entry of entries) {
    const tracked = findTrackedMr(entry.identity, deps.trackingGateway, repositories);
    const shouldRemove =
      tracked === null || isClosedOrMergedOverThreshold(tracked, now) || isStale(entry, now);

    if (!shouldRemove) continue;

    try {
      const result = await deps.removeWorktree(entry.identity);
      if (result.status === 'removed') {
        removedCount += 1;
      } else if (result.status === 'failed') {
        failures += 1;
      }
    } catch {
      failures += 1;
    }
  }

  return {
    scanned: entries.length,
    removed: removedCount,
    failures,
  };
}
