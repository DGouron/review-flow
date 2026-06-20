import type { DiffMetadataFetchGateway } from '@/modules/platform-integration/entities/diffMetadata/diffMetadata.gateway.js';
import type { DiffMetadata } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';

export class StubDiffMetadataFetchGateway implements DiffMetadataFetchGateway {
  private metadata: DiffMetadata = { baseSha: 'base', headSha: 'head', startSha: 'start' };
  private failure: Error | null = null;

  setMetadata(metadata: DiffMetadata): void {
    this.metadata = metadata;
  }

  failWith(error: Error): void {
    this.failure = error;
  }

  fetchDiffMetadata(_projectPath: string, _mergeRequestNumber: number): DiffMetadata {
    if (this.failure) {
      throw this.failure;
    }
    return this.metadata;
  }
}
