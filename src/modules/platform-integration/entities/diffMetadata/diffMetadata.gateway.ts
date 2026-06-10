import type { DiffMetadata } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';

export interface DiffMetadataFetchGateway {
  fetchDiffMetadata(projectPath: string, mergeRequestNumber: number): DiffMetadata;
}
