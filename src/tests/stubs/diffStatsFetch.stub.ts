import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';

export class StubDiffStatsFetchGateway implements DiffStatsFetchGateway {
  private responses = new Map<number, DiffStats | null>();
  private failingMergeRequests = new Set<number>();
  fetchCallCount = 0;
  lastProjectIdentifier: string | null = null;

  fetchDiffStats(projectIdentifier: string, mergeRequestNumber: number): DiffStats | null {
    this.fetchCallCount++;
    this.lastProjectIdentifier = projectIdentifier;

    if (this.failingMergeRequests.has(mergeRequestNumber)) {
      throw new Error(`API error for MR ${mergeRequestNumber}`);
    }

    return this.responses.get(mergeRequestNumber) ?? null;
  }

  setResponse(mergeRequestNumber: number, diffStats: DiffStats | null): void {
    this.responses.set(mergeRequestNumber, diffStats);
  }

  setFailure(mergeRequestNumber: number): void {
    this.failingMergeRequests.add(mergeRequestNumber);
  }
}
