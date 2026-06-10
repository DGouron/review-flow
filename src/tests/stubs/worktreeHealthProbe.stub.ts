import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type {
  HealthSignals,
  WorktreeHealthProbeGateway,
} from '@/modules/worktree-management/entities/worktree/worktreeHealthProbe.gateway.js';

export class StubWorktreeHealthProbeGateway implements WorktreeHealthProbeGateway {
  private readonly signalsByPath: Map<string, HealthSignals> = new Map();
  private defaultSignals: HealthSignals | null = null;
  readonly probedPaths: string[] = [];

  setSignals(path: string, signals: HealthSignals): void {
    this.signalsByPath.set(path, signals);
  }

  setDefault(signals: HealthSignals): void {
    this.defaultSignals = signals;
  }

  async probe(entry: WorktreeEntry): Promise<HealthSignals> {
    this.probedPaths.push(entry.path);
    const direct = this.signalsByPath.get(entry.path);
    if (direct) return direct;
    if (this.defaultSignals !== null) return this.defaultSignals;
    return {
      mtime: entry.mtime,
      orphanLock: null,
      unresolvedConflict: false,
    };
  }
}
