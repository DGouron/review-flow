import type { Logger } from 'pino';

import type {
  BudgetStatusPresenter,
  BudgetStatusViewModel,
} from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';
import type { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';

export interface BroadcastBudgetDependencies {
  getBudgetStatus: Pick<GetBudgetStatusUseCase, 'execute'>;
  broadcastBudgetStatus: (viewModel: BudgetStatusViewModel) => void;
  presenter: BudgetStatusPresenter;
}

export interface BroadcastBudgetInput {
  localPaths: string[];
}

export async function broadcastBudgetAfterUsage(
  deps: BroadcastBudgetDependencies,
  input: BroadcastBudgetInput,
  logger: Logger,
): Promise<void> {
  try {
    const status = await deps.getBudgetStatus.execute({ localPaths: input.localPaths });
    deps.broadcastBudgetStatus(deps.presenter.present(status));
  } catch (error) {
    logger.warn({ error }, 'Failed to broadcast budget status after token usage recording');
  }
}
