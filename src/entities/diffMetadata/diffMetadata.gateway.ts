import type { DiffMetadata } from '../reviewContext/reviewContext.js'

export interface DiffMetadataFetchGateway {
  fetchDiffMetadata(projectPath: string, mergeRequestNumber: number): DiffMetadata
}
