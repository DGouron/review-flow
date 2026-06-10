import type { FastifyPluginAsync } from 'fastify';

import type { RepositoryConfig } from '@/frameworks/config/configLoader.js';
import type { BudgetGateway } from '@/modules/token-accounting/entities/budget/budget.gateway.js';
import { BUDGET_DEFAULT_USD } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';
import type { BudgetStatusPresenter } from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';
import type { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';
import type { UpdateBudgetUseCase } from '@/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.js';

export interface BudgetRoutesOptions {
  getBudgetStatus: GetBudgetStatusUseCase;
  updateBudget: UpdateBudgetUseCase;
  budgetGateway: BudgetGateway;
  presenter: BudgetStatusPresenter;
  getRepositories: () => RepositoryConfig[];
  now?: () => Date;
}

interface UpdateBudgetBody {
  limitUsd?: unknown;
}

export const budgetRoutes: FastifyPluginAsync<BudgetRoutesOptions> = async (fastify, opts) => {
  const { getBudgetStatus, updateBudget, budgetGateway, presenter, getRepositories, now } = opts;

  fastify.get('/api/budget', async () => {
    const config = await budgetGateway.load();
    return { limitUsd: config?.limitUsd ?? BUDGET_DEFAULT_USD };
  });

  fastify.post<{ Body: UpdateBudgetBody }>('/api/budget', async (request, reply) => {
    const { limitUsd } = request.body ?? {};
    if (typeof limitUsd !== 'number' || !Number.isFinite(limitUsd)) {
      reply.code(400);
      return { success: false, error: 'limitUsd must be a number' };
    }

    const result = await updateBudget.execute({ limitUsd });
    if (!result.success) {
      reply.code(400);
      return result;
    }
    return result;
  });

  fastify.get('/api/budget/status', async () => {
    const localPaths = getRepositories()
      .filter((repository) => repository.enabled)
      .map((repository) => repository.localPath);

    const status = await getBudgetStatus.execute({
      localPaths,
      now: now ? now() : undefined,
    });
    return presenter.present(status);
  });
};
