import type { TokenUsageSummary } from '@/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.js';
import type { Presenter } from '@/shared/foundation/presenter.base.js';

export interface ModelBreakdownItem {
  name: string;
  count: number;
  costUsd: string;
  costShare: string;
}

export interface TokenUsageSummaryViewModel {
  totalCostUsd: string;
  recordCount: number;
  totalTokens: number;
  models: ModelBreakdownItem[];
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
      isEmpty: summary.recordCount === 0,
    };
  }
}
