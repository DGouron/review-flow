import type { TokenUsageSummary } from '@/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.js';
import type { Presenter } from '@/shared/foundation/presenter.base.js';

export interface ModelBreakdownItem {
  name: string;
  count: number;
  costUsd: string;
  costShare: string;
}

export interface JobTypeBreakdownItem {
  name: 'review' | 'followup';
  count: number;
  costUsd: string;
}

export interface TokenUsageSummaryViewModel {
  totalCostUsd: string;
  recordCount: number;
  totalTokens: number;
  models: ModelBreakdownItem[];
  jobTypes: JobTypeBreakdownItem[];
  medianMergeRequestCostUsd: string | null;
  isEmpty: boolean;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatShare(part: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

export class TokenUsageSummaryPresenter implements Presenter<
  TokenUsageSummary,
  TokenUsageSummaryViewModel
> {
  present(summary: TokenUsageSummary): TokenUsageSummaryViewModel {
    const models: ModelBreakdownItem[] = Object.entries(summary.byModel)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        costUsd: formatUsd(stats.costUsd),
        costShare: formatShare(stats.costUsd, summary.totalCostUsd),
      }))
      .toSorted((a, b) => {
        const costA = summary.byModel[a.name]?.costUsd ?? 0;
        const costB = summary.byModel[b.name]?.costUsd ?? 0;
        return costB - costA;
      });

    return {
      totalCostUsd: formatUsd(summary.totalCostUsd),
      recordCount: summary.recordCount,
      totalTokens: summary.totalInputTokens + summary.totalOutputTokens,
      models,
      jobTypes: (['review', 'followup'] as const).map((name) => ({
        name,
        count: summary.byJobType[name].count,
        costUsd: formatUsd(summary.byJobType[name].costUsd),
      })),
      medianMergeRequestCostUsd:
        summary.medianMergeRequestCostUsd === null
          ? null
          : formatUsd(summary.medianMergeRequestCostUsd),
      isEmpty: summary.recordCount === 0,
    };
  }
}
