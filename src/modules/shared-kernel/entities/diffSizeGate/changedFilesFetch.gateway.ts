import type { ChangedFile } from '@/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.js';

export interface ChangedFilesFetchGateway {
  fetchChangedFiles(projectIdentifier: string, mergeRequestNumber: number): ChangedFile[] | null;
}
