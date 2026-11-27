import { medianMergeRequestCostUsd } from '@/modules/token-accounting/entities/tokenUsage/medianMergeRequestCost.js';
import type { TokenUsageGateway } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.js';
import type { TokenUsageRecord } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

export type TokenUsageSummary = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  totalCostUsd: number;
  recordCount: number;
  byModel: Record<string, { count: number; costUsd: number }>;
  byJobType: Record<'review' | 'followup', { count: number; costUsd: number }>;
  medianMergeRequestCostUsd: number | null;
};

export type SummarizeInput = {
  localPath: string;
  since?: string;
};

/** A role session works for a review already counted: it adds cost, not a session to count. */
function isReviewSession(record: TokenUsageRecord): boolean {
  return record.role === undefined;
}

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
      recordCount: records.filter(isReviewSession).length,
      byModel: {},
      byJobType: { review: { count: 0, costUsd: 0 }, followup: { count: 0, costUsd: 0 } },
      medianMergeRequestCostUsd: medianMergeRequestCostUsd(records),
    };

    for (const record of records) {
      summary.totalInputTokens += record.usage.inputTokens;
      summary.totalOutputTokens += record.usage.outputTokens;
      summary.totalCacheRead += record.usage.cacheReadInputTokens;
      summary.totalCacheCreation += record.usage.cacheCreationInputTokens;
      summary.totalCostUsd += record.usage.costUsd;

      const jobTypeEntry = summary.byJobType[record.jobType ?? 'review'];
      if (isReviewSession(record)) jobTypeEntry.count += 1;
      jobTypeEntry.costUsd += record.usage.costUsd;

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
