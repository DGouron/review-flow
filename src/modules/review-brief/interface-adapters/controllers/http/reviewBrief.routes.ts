import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { z } from 'zod';

import type {
  ExplainReviewRequestResult,
  ExplainReviewRequestUseCase,
} from '@/modules/review-brief/usecases/explainReviewRequest/explainReviewRequest.usecase.js';
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';

export interface ReviewBriefRoutesOptions {
  getRepositories: () => RepositoryConfig[];
  explainReviewRequest: Pick<ExplainReviewRequestUseCase, 'execute'>;
  getLanguage: () => Language;
  logger: Logger;
}

const briefRequestSchema = z.object({
  projectPath: z.string().min(1),
  mrNumber: z.number().int().positive(),
  refresh: z.boolean().optional(),
});

const ERROR_MESSAGES = {
  invalidBody: 'Requête invalide : projectPath et mrNumber (entier positif) sont requis',
  unknownProject: 'Projet inconnu ou désactivé',
  notTracked: "Cette demande de revue n'est pas suivie pour ce projet",
  generationFailed: "Le brief n'a pas pu être produit",
};

function sendResult(
  reply: FastifyReply,
  result: ExplainReviewRequestResult,
  logger: Logger,
): FastifyReply {
  if (result.status === 'not-tracked') {
    return reply.code(404).send({ error: ERROR_MESSAGES.notTracked });
  }
  if (result.status === 'generation-failed') {
    logger.warn({ reason: result.reason }, `Review brief generation failed: ${result.reason}`);
    return reply.code(502).send({ error: ERROR_MESSAGES.generationFailed });
  }
  return reply.code(200).send(result.brief);
}

function isEnabledRepository(repositories: RepositoryConfig[], projectPath: string): boolean {
  return repositories.some((candidate) => candidate.localPath === projectPath && candidate.enabled);
}

/**
 * POST /api/mr-tracking/brief — explains a tracked review request. Read-only on the platforms.
 */
export const reviewBriefRoutes: FastifyPluginAsync<ReviewBriefRoutesOptions> = async (
  fastify,
  options,
) => {
  const { getRepositories, explainReviewRequest, getLanguage, logger } = options;

  fastify.post('/api/mr-tracking/brief', async (request, reply) => {
    const parsed = briefRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: ERROR_MESSAGES.invalidBody });
    }
    const { projectPath, mrNumber, refresh } = parsed.data;
    if (!isEnabledRepository(getRepositories(), projectPath)) {
      return reply.code(404).send({ error: ERROR_MESSAGES.unknownProject });
    }
    try {
      const result = await explainReviewRequest.execute({
        localPath: projectPath,
        mrNumber,
        refresh: refresh ?? false,
        language: getLanguage(),
      });
      return sendResult(reply, result, logger);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ projectPath, mrNumber, error: message }, `Review brief failed: ${message}`);
      return reply.code(502).send({ error: ERROR_MESSAGES.generationFailed });
    }
  });
};
