import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';

export interface DiffStatsFetchGateway {
  fetchDiffStats(projectIdentifier: string, mergeRequestNumber: number): DiffStats | null;
}
