import type { FastifyPluginAsync } from 'fastify';

import type { MergeRequestTokenUsagePresenter } from '@/modules/token-accounting/interface-adapters/presenters/mergeRequestTokenUsage.presenter.js';
import type { TokenUsageSummaryPresenter } from '@/modules/token-accounting/interface-adapters/presenters/tokenUsageSummary.presenter.js';
import type { GetMergeRequestTokenUsageUseCase } from '@/modules/token-accounting/usecases/getMergeRequestTokenUsage/getMergeRequestTokenUsage.usecase.js';
import type { SummarizeTokenUsageUseCase } from '@/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.js';

export interface TokenUsageRoutesOptions {
  summarizeTokenUsage: SummarizeTokenUsageUseCase;
  presenter: TokenUsageSummaryPresenter;
  getMergeRequestTokenUsage: GetMergeRequestTokenUsageUseCase;
  mergeRequestTokenUsagePresenter: MergeRequestTokenUsagePresenter;
  getLocalPaths: () => string[];
}

interface SummaryQuery {
  projectPath?: string;
  since?: string;
}

interface MergeRequestQuery {
  project?: string;
  mrNumber?: string;
}

export const tokenUsageRoutes: FastifyPluginAsync<TokenUsageRoutesOptions> = async (
  fastify,
  opts,
) => {
  const {
    summarizeTokenUsage,
    presenter,
    getMergeRequestTokenUsage,
    mergeRequestTokenUsagePresenter,
    getLocalPaths,
  } = opts;

  fastify.get<{ Querystring: SummaryQuery }>('/api/token-usage/summary', async (request, reply) => {
    const { projectPath, since } = request.query;

    if (!projectPath) {
      reply.code(400);
      return { error: 'projectPath query parameter is required' };
    }

    const summary = await summarizeTokenUsage.execute({ localPath: projectPath, since });
    return presenter.present(summary);
  });

  fastify.get<{ Querystring: MergeRequestQuery }>(
    '/api/token-usage/merge-request',
    async (request, reply) => {
      const { project } = request.query;
      const mrNumber = Number(request.query.mrNumber);
      if (!project || !Number.isInteger(mrNumber)) {
        reply.code(400);
        return { error: 'project and mrNumber query parameters are required' };
      }

      const usage = await getMergeRequestTokenUsage.execute({
        localPaths: getLocalPaths(),
        project,
        mrNumber,
      });
      return mergeRequestTokenUsagePresenter.present(usage);
    },
  );
};
