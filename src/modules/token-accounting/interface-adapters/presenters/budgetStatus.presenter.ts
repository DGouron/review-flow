import type { BudgetStatus } from '@/modules/token-accounting/entities/budget/budgetStatus.js';
import type { Presenter } from '@/shared/foundation/presenter.base.js';

export interface BudgetStatusViewModel {
  limitUsdFormatted: string;
  consumedUsdFormatted: string;
  remainingUsdFormatted: string;
  percentUsedFormatted: string;
  gaugeWidthPercent: number;
  exceeded: boolean;
  periodStart: string;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatPercent(percent: number): string {
  return `${percent.toFixed(2)}%`;
}

export class BudgetStatusPresenter implements Presenter<BudgetStatus, BudgetStatusViewModel> {
  present(status: BudgetStatus): BudgetStatusViewModel {
    return {
      limitUsdFormatted: formatUsd(status.limitUsd),
      consumedUsdFormatted: formatUsd(status.consumedUsd),
      remainingUsdFormatted: formatUsd(status.remainingUsd),
      percentUsedFormatted: formatPercent(status.percentUsed),
      gaugeWidthPercent: Math.min(100, status.percentUsed),
      exceeded: status.exceeded,
      periodStart: status.periodStart,
    };
  }
}
