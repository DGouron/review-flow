import type { ChangedFilesFetchGateway } from '@/modules/shared-kernel/entities/diffSizeGate/changedFilesFetch.gateway.js';
import type { ChangedFile } from '@/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.js';

export class StubChangedFilesFetchGateway implements ChangedFilesFetchGateway {
  private responses = new Map<number, ChangedFile[] | null>();
  private failingMergeRequests = new Set<number>();
  fetchCallCount = 0;
  lastProjectIdentifier: string | null = null;

  fetchChangedFiles(projectIdentifier: string, mergeRequestNumber: number): ChangedFile[] | null {
    this.fetchCallCount++;
    this.lastProjectIdentifier = projectIdentifier;

    if (this.failingMergeRequests.has(mergeRequestNumber)) {
      throw new Error(`API error for MR ${mergeRequestNumber}`);
    }

    return this.responses.get(mergeRequestNumber) ?? null;
  }

  setResponse(mergeRequestNumber: number, files: ChangedFile[] | null): void {
    this.responses.set(mergeRequestNumber, files);
  }

  setFailure(mergeRequestNumber: number): void {
    this.failingMergeRequests.add(mergeRequestNumber);
  }
}
