import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';

import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';
import type { ReviewFileGateway } from '@/modules/review-execution/entities/review/reviewFile.gateway.js';
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';
import type { AiInsightsSessionGateway } from '@/modules/statistics-insights/entities/insight/aiInsightsSession.gateway.js';
import type { InsightsGateway } from '@/modules/statistics-insights/entities/insight/insights.gateway.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import { InsightsPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/insights.presenter.js';
import { generateAiInsightsViaSession } from '@/modules/statistics-insights/usecases/insights/generateAiInsightsViaSession.usecase.js';
import { getInsightsWithAiStatus } from '@/modules/statistics-insights/usecases/insights/getInsightsWithAiStatus.usecase.js';
import { persistAiInsightsResult } from '@/modules/statistics-insights/usecases/insights/persistAiInsights.usecase.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';

interface InsightsRoutesOptions {
  statsGateway: StatsGateway;
  insightsGateway: InsightsGateway;
  reviewFileGateway: ReviewFileGateway;
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  logger: Logger;
  session: AiInsightsSessionGateway;
  environment: EnvironmentGateway;
  language: Language;
}

function isValidProjectPath(path: string | null): path is string {
  if (!path) return false;
  const trimmed = path.trim();
  return trimmed.startsWith('/') && !trimmed.includes('..');
}

export const insightsRoutes: FastifyPluginAsync<InsightsRoutesOptions> = async (
  fastify,
  options,
) => {
  const {
    statsGateway,
    insightsGateway,
    reviewFileGateway,
    reviewRequestTrackingGateway,
    logger,
    session,
    environment,
    language,
  } = options;
  const presenter = new InsightsPresenter();

  fastify.get<{ Querystring: { path?: string } }>('/api/insights', async (request, reply) => {
    const projectPath = request.query.path?.trim() ?? null;

    if (!isValidProjectPath(projectPath)) {
      reply.status(400).send({ error: 'Chemin du projet requis' });
      return;
    }

    const result = getInsightsWithAiStatus({
      projectPath,
      statsGateway,
      insightsGateway,
    });

    const viewModel = presenter.present({
      developerInsights: result.developerInsights,
      teamInsight: result.teamInsight,
    });

    return {
      ...viewModel,
      aiInsights: result.aiInsights,
      hasNewReviewsSinceAiGeneration: result.hasNewReviewsSinceAiGeneration,
    };
  });

  fastify.post<{ Body: { path?: string; language?: string } }>(
    '/api/insights/generate',
    async (request, reply) => {
      const body = request.body;
      const projectPath =
        typeof body === 'object' && body !== null && 'path' in body ? body.path : null;

      if (typeof projectPath !== 'string' || !isValidProjectPath(projectPath)) {
        reply.status(400).send({ error: 'Chemin du projet requis' });
        return;
      }

      const requestLanguage =
        typeof body === 'object' &&
        body !== null &&
        'language' in body &&
        (body.language === 'fr' || body.language === 'en')
          ? body.language
          : language;

      try {
        const aiInsights = await generateAiInsightsViaSession({
          projectPath,
          statsGateway,
          reviewFileGateway,
          reviewRequestTrackingGateway,
          logger,
          session,
          environment,
          language: requestLanguage,
        });

        persistAiInsightsResult({
          projectPath,
          aiInsights,
          statsGateway,
          insightsGateway,
        });

        return aiInsights;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erreur inconnue';
        logger.error({ error: message }, 'AI insights generation failed');
        reply.status(500).send({ error: message });
        return;
      }
    },
  );
};
