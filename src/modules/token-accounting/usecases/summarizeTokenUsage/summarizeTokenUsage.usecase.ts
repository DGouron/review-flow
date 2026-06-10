import type { TokenUsageGateway } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.js';

export type TokenUsageSummary = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  totalCostUsd: number;
  recordCount: number;
  byModel: Record<string, { count: number; costUsd: number }>;
};

export type SummarizeInput = {
  localPath: string;
  since?: string;
};

export class SummarizeTokenUsageUseCase {
  constructor(private readonly gateway: TokenUsageGateway) {}

  async execute({ localPath, since }: SummarizeInput): Promise<TokenUsageSummary> {
    const allRecords = await this.gateway.loadAll(localPath);

    const records = since ? allRecords.filter((record) => record.recordedAt >= since) : allRecords;

    const summary: TokenUsageSummary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheRead: 0,
      totalCacheCreation: 0,
      totalCostUsd: 0,
      recordCount: records.length,
      byModel: {},
    };

    for (const record of records) {
      summary.totalInputTokens += record.usage.inputTokens;
      summary.totalOutputTokens += record.usage.outputTokens;
      summary.totalCacheRead += record.usage.cacheReadInputTokens;
      summary.totalCacheCreation += record.usage.cacheCreationInputTokens;
      summary.totalCostUsd += record.usage.costUsd;

      const modelEntry = summary.byModel[record.model];
      if (modelEntry) {
        modelEntry.count += 1;
        modelEntry.costUsd += record.usage.costUsd;
      } else {
        summary.byModel[record.model] = { count: 1, costUsd: record.usage.costUsd };
      }
    }

    return summary;
  }
}
