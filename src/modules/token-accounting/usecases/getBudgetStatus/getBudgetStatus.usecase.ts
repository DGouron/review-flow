import type { BudgetGateway } from '@/modules/token-accounting/entities/budget/budget.gateway.js';
import { BUDGET_DEFAULT_USD } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';
import type { BudgetStatus } from '@/modules/token-accounting/entities/budget/budgetStatus.js';
import type { TokenUsageGateway } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.js';

export interface GetBudgetStatusDependencies {
  budgetGateway: BudgetGateway;
  tokenUsageGateway: TokenUsageGateway;
}

export interface GetBudgetStatusInput {
  localPaths: string[];
  now?: Date;
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export class GetBudgetStatusUseCase {
  constructor(private readonly deps: GetBudgetStatusDependencies) {}

  async execute({ localPaths, now }: GetBudgetStatusInput): Promise<BudgetStatus> {
    const currentInstant = now ?? new Date();
    const periodStart = startOfMonthUtc(currentInstant);
    const periodStartIso = periodStart.toISOString();

    const config = await this.deps.budgetGateway.load();
    const limitUsd = config?.limitUsd ?? BUDGET_DEFAULT_USD;

    let consumedRaw = 0;
    for (const localPath of localPaths) {
      const records = await this.deps.tokenUsageGateway.loadAll(localPath);
      for (const record of records) {
        if (record.recordedAt >= periodStartIso) {
          consumedRaw += record.usage.costUsd;
        }
      }
    }

    const consumedUsd = roundToTwoDecimals(consumedRaw);
    const remainingUsd = consumedUsd >= limitUsd ? 0 : roundToTwoDecimals(limitUsd - consumedUsd);
    const percentUsed =
      limitUsd === 0
        ? consumedUsd > 0
          ? 100
          : 0
        : roundToTwoDecimals((consumedUsd / limitUsd) * 100);
    const exceeded = consumedUsd >= limitUsd;

    return {
      limitUsd,
      consumedUsd,
      remainingUsd,
      percentUsed,
      exceeded,
      periodStart: periodStartIso,
    };
  }
}
