import type { FastifyPluginAsync } from 'fastify';

import type { TokenUsageSummaryPresenter } from '@/modules/token-accounting/interface-adapters/presenters/tokenUsageSummary.presenter.js';
import type { SummarizeTokenUsageUseCase } from '@/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.js';

export interface TokenUsageRoutesOptions {
  summarizeTokenUsage: SummarizeTokenUsageUseCase;
  presenter: TokenUsageSummaryPresenter;
}

interface SummaryQuery {
  projectPath?: string;
  since?: string;
}

export const tokenUsageRoutes: FastifyPluginAsync<TokenUsageRoutesOptions> = async (
  fastify,
  opts,
) => {
  const { summarizeTokenUsage, presenter } = opts;

  fastify.get<{ Querystring: SummaryQuery }>('/api/token-usage/summary', async (request, reply) => {
    const { projectPath, since } = request.query;

    if (!projectPath) {
      reply.code(400);
      return { error: 'projectPath query parameter is required' };
    }

    const summary = await summarizeTokenUsage.execute({ localPath: projectPath, since });
    return presenter.present(summary);
  });
};
