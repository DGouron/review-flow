import type { LastSweepSummary } from '@/modules/worktree-management/entities/sweep/lastSweepSummary.schema.js';
import type {
  WorktreeEntry,
  WorktreePlatform,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type {
  DegradedReason,
  WorktreeHealthReport,
} from '@/modules/worktree-management/entities/worktree/worktreeHealth.schema.js';
import type { WorktreeSizeProbeGateway } from '@/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export type WorktreeRowStatus = 'active' | 'idle' | 'stale';

export interface WorktreeRowViewModel {
  mrNumber: number;
  path: string;
  mtime: string;
  ageSeconds: number;
  sizeBytes: number | null;
  status: WorktreeRowStatus;
}

export interface WorktreeGroupViewModel {
  platform: WorktreePlatform;
  projectPath: string;
  worktrees: WorktreeRowViewModel[];
}

export interface LastSweepViewModel {
  ranAt: string;
  removed: number;
  failures: number;
  scanned: number;
}

export type DegradedReasonCode = DegradedReason['kind'];

export interface DegradedRowViewModel {
  mrNumber: number;
  platform: WorktreePlatform;
  projectPath: string;
  path: string;
  reasonCode: DegradedReasonCode;
  reasonLabel: string;
  detectedAtIso: string;
  recommendedAction: string;
  cleanupEndpointPayload: {
    platform: WorktreePlatform;
    projectPath: string;
    mrNumber: number;
  };
}

export interface WorktreePanelViewModel {
  totalCount: number;
  totalSizeBytes: number;
  activeCount: number;
  idleCount: number;
  staleCount: number;
  nextSweepAt: string;
  lastSweep: LastSweepViewModel | null;
  groups: WorktreeGroupViewModel[];
  degradedCount: number;
  degraded: DegradedRowViewModel[];
}

export interface WorktreePanelPresenterInput {
  worktrees: WorktreeEntry[];
  lastSweep: LastSweepSummary | null;
  nextSweepAt: Date;
  healthReports?: WorktreeHealthReport[];
}

export interface WorktreePanelPresenterDependencies {
  sizeProbe: WorktreeSizeProbeGateway;
  cacheTtlMs?: number;
  now?: () => Date;
}

interface SizeCacheEntry {
  sizeBytes: number | null;
  expiresAt: number;
}

function computeStatus(ageSeconds: number): WorktreeRowStatus {
  const ageMs = ageSeconds * 1000;
  if (ageMs < ONE_DAY_MS) return 'active';
  if (ageMs <= SEVEN_DAYS_MS) return 'idle';
  return 'stale';
}

function formatHours(ms: number): string {
  return String(Math.max(1, Math.round(ms / (60 * 60 * 1000))));
}

function describeReason(reason: DegradedReason): { label: string; action: string } {
  if (reason.kind === 'stale') {
    return {
      label: `Worktree inactif depuis ${formatHours(reason.ageMs)}h`,
      action: 'Cleanup forcé recommandé',
    };
  }
  if (reason.kind === 'orphan-git-lock') {
    return {
      label: `Lock git orphelin depuis ${formatHours(reason.lockAgeMs)}h`,
      action: 'Cleanup forcé recommandé',
    };
  }
  return {
    label: 'Conflit git non résolu',
    action: 'Cleanup forcé recommandé',
  };
}

function buildDegradedRow(report: WorktreeHealthReport): DegradedRowViewModel | null {
  if (report.health.status !== 'degraded') return null;
  const { entry, health } = report;
  const description = describeReason(health.reason);
  return {
    mrNumber: entry.identity.mrNumber,
    platform: entry.identity.platform,
    projectPath: entry.identity.projectPath,
    path: entry.path,
    reasonCode: health.reason.kind,
    reasonLabel: description.label,
    detectedAtIso: health.detectedAt.toISOString(),
    recommendedAction: description.action,
    cleanupEndpointPayload: {
      platform: entry.identity.platform,
      projectPath: entry.identity.projectPath,
      mrNumber: entry.identity.mrNumber,
    },
  };
}

function groupKey(platform: WorktreePlatform, projectPath: string): string {
  return `${platform}:${projectPath}`;
}

export class WorktreePanelPresenter {
  private readonly sizeProbe: WorktreeSizeProbeGateway;
  private readonly cacheTtlMs: number;
  private readonly now: () => Date;
  private readonly sizeCache: Map<string, SizeCacheEntry> = new Map();

  constructor(deps: WorktreePanelPresenterDependencies) {
    this.sizeProbe = deps.sizeProbe;
    this.cacheTtlMs = deps.cacheTtlMs ?? 30_000;
    this.now = deps.now ?? (() => new Date());
  }

  async present(input: WorktreePanelPresenterInput): Promise<WorktreePanelViewModel> {
    const nowMs = this.now().getTime();
    const groupsMap = new Map<string, WorktreeGroupViewModel>();
    let totalSizeBytes = 0;
    let activeCount = 0;
    let idleCount = 0;
    let staleCount = 0;

    for (const entry of input.worktrees) {
      const sizeBytes = await this.resolveSize(entry.path, nowMs);
      if (sizeBytes !== null) {
        totalSizeBytes += sizeBytes;
      }
      const ageSeconds = Math.max(0, Math.floor((nowMs - entry.mtime.getTime()) / 1000));
      const status = computeStatus(ageSeconds);
      if (status === 'active') activeCount += 1;
      else if (status === 'idle') idleCount += 1;
      else staleCount += 1;
      const row: WorktreeRowViewModel = {
        mrNumber: entry.identity.mrNumber,
        path: entry.path,
        mtime: entry.mtime.toISOString(),
        ageSeconds,
        sizeBytes,
        status,
      };
      const key = groupKey(entry.identity.platform, entry.identity.projectPath);
      const existing = groupsMap.get(key);
      if (existing) {
        existing.worktrees.push(row);
      } else {
        groupsMap.set(key, {
          platform: entry.identity.platform,
          projectPath: entry.identity.projectPath,
          worktrees: [row],
        });
      }
    }

    const groups = Array.from(groupsMap.values())
      .map((group) => ({
        ...group,
        worktrees: [...group.worktrees].toSorted(
          (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
        ),
      }))
      .toSorted((a, b) =>
        groupKey(a.platform, a.projectPath).localeCompare(groupKey(b.platform, b.projectPath)),
      );

    const degraded: DegradedRowViewModel[] = [];
    if (input.healthReports) {
      for (const report of input.healthReports) {
        const row = buildDegradedRow(report);
        if (row !== null) degraded.push(row);
      }
    }

    return {
      totalCount: input.worktrees.length,
      totalSizeBytes,
      activeCount,
      idleCount,
      staleCount,
      nextSweepAt: input.nextSweepAt.toISOString(),
      lastSweep:
        input.lastSweep === null
          ? null
          : {
              ranAt: input.lastSweep.ranAt.toISOString(),
              removed: input.lastSweep.removed,
              failures: input.lastSweep.failures,
              scanned: input.lastSweep.scanned,
            },
      groups,
      degradedCount: degraded.length,
      degraded,
    };
  }

  private async resolveSize(path: string, nowMs: number): Promise<number | null> {
    const cached = this.sizeCache.get(path);
    if (cached !== undefined && cached.expiresAt > nowMs) {
      return cached.sizeBytes;
    }
    const sizeBytes = await this.sizeProbe.probe(path);
    this.sizeCache.set(path, {
      sizeBytes,
      expiresAt: nowMs + this.cacheTtlMs,
    });
    return sizeBytes;
  }
}
