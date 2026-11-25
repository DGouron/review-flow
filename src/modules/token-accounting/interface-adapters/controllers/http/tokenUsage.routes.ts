import type { FastifyPluginAsync } from 'fastify';

import type { ReviewTokenUsagePresenter } from '@/modules/token-accounting/interface-adapters/presenters/reviewTokenUsage.presenter.js';
import type { TokenUsageSummaryPresenter } from '@/modules/token-accounting/interface-adapters/presenters/tokenUsageSummary.presenter.js';
import type { GetReviewTokenUsageUseCase } from '@/modules/token-accounting/usecases/getReviewTokenUsage/getReviewTokenUsage.usecase.js';
import type { SummarizeTokenUsageUseCase } from '@/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.js';

export interface TokenUsageRoutesOptions {
  summarizeTokenUsage: SummarizeTokenUsageUseCase;
  presenter: TokenUsageSummaryPresenter;
  getReviewTokenUsage: GetReviewTokenUsageUseCase;
  reviewTokenUsagePresenter: ReviewTokenUsagePresenter;
  findReportLocalPath: (filename: string) => Promise<string | null>;
}

interface SummaryQuery {
  projectPath?: string;
  since?: string;
}

const REPORT_FILENAME_REGEX = /^(\d{4}-\d{2}-\d{2})-(?:MR|PR)-(\d+)-(review|followup)\.md$/;

export const tokenUsageRoutes: FastifyPluginAsync<TokenUsageRoutesOptions> = async (
  fastify,
  opts,
) => {
  const {
    summarizeTokenUsage,
    presenter,
    getReviewTokenUsage,
    reviewTokenUsagePresenter,
    findReportLocalPath,
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

  fastify.get<{ Params: { filename: string } }>(
    '/api/token-usage/review/:filename',
    async (request, reply) => {
      const { filename } = request.params;
      const report = REPORT_FILENAME_REGEX.exec(filename);
      if (!report) {
        reply.code(400);
        return { error: 'Invalid filename format' };
      }

      const localPath = await findReportLocalPath(filename);
      if (localPath === null) {
        reply.code(404);
        return { error: 'Review not found' };
      }

      const [, day, mrNumber, jobType] = report;
      const usage = await getReviewTokenUsage.execute({
        localPath,
        mrNumber: Number(mrNumber),
        jobType: jobType === 'followup' ? 'followup' : 'review',
        day,
      });
      return reviewTokenUsagePresenter.present(usage);
    },
  );
};
