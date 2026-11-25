import { medianMergeRequestCostUsd } from '@/modules/token-accounting/entities/tokenUsage/medianMergeRequestCost.js';
import type { TokenUsageGateway } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.js';
import type { TokenUsageRecord } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

export type GetMergeRequestTokenUsageInput = {
  localPaths: string[];
  project: string;
  mrNumber: number;
};

export type MergeRequestTokenUsage = {
  sessions: TokenUsageRecord[];
  projectMedianCostUsd: number | null;
};

export class GetMergeRequestTokenUsageUseCase {
  constructor(private readonly gateway: TokenUsageGateway) {}

  async execute({
    localPaths,
    project,
    mrNumber,
  }: GetMergeRequestTokenUsageInput): Promise<MergeRequestTokenUsage> {
    const projectRecords: TokenUsageRecord[] = [];
    for (const localPath of localPaths) {
      const records = await this.gateway.loadAll(localPath);
      projectRecords.push(...records.filter((record) => record.projectPath === project));
    }
    const sessions = projectRecords
      .filter((record) => record.mrNumber === mrNumber)
      .toSorted((a, b) => a.recordedAt.localeCompare(b.recordedAt));

    return {
      sessions,
      projectMedianCostUsd: sessions.length > 0 ? medianMergeRequestCostUsd(projectRecords) : null,
    };
  }
}
