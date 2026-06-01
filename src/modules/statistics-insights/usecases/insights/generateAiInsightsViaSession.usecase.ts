import type { Logger } from 'pino';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import type { ReviewFileGateway } from '@/modules/review-execution/entities/review/reviewFile.gateway.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';
import type { AiInsightsSessionGateway } from '@/modules/statistics-insights/entities/insight/aiInsightsSession.gateway.js';
import type { AiInsightsResult } from '@/modules/statistics-insights/entities/insight/aiInsight.js';
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';
import { buildAiInsightsPrompt } from '@/modules/statistics-insights/usecases/insights/buildAiInsightsPrompt.js';
import { parseAiInsightsResponse } from '@/modules/statistics-insights/usecases/insights/parseAiInsightsResponse.js';

const NO_STATS_MESSAGE = 'Aucune statistique de review disponible pour ce projet';
const API_KEY_PRESENT_MESSAGE =
  "Impossible de générer les insights — l'abonnement Claude est requis, pas de clé API";
const UNAVAILABLE_MESSAGE =
  'Impossible de générer les insights — connexion à l\'abonnement Claude requise';
const TIMEOUT_MESSAGE = 'La génération des insights a expiré';

interface GenerateAiInsightsViaSessionInput {
  projectPath: string;
  statsGateway: StatsGateway;
  reviewFileGateway: ReviewFileGateway;
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  logger: Logger;
  session: AiInsightsSessionGateway;
  environment: EnvironmentGateway;
  language: Language;
}

export async function generateAiInsightsViaSession(
  input: GenerateAiInsightsViaSessionInput,
): Promise<AiInsightsResult> {
  const {
    projectPath,
    statsGateway,
    reviewFileGateway,
    reviewRequestTrackingGateway,
    logger,
    session,
    environment,
    language,
  } = input;

  if (environment.hasAnthropicApiKey()) {
    throw new Error(API_KEY_PRESENT_MESSAGE);
  }

  const stats = statsGateway.loadProjectStats(projectPath);
  if (!stats || stats.reviews.length === 0) {
    throw new Error(NO_STATS_MESSAGE);
  }

  const reviewFiles = await reviewFileGateway.listReviews(projectPath);
  const reviewContents = new Map<string, string>();

  for (const reviewFile of reviewFiles) {
    const content = await reviewFileGateway.readReview(projectPath, reviewFile.filename);
    if (content) {
      reviewContents.set(reviewFile.mrNumber, content);
    }
  }

  const trackingData = reviewRequestTrackingGateway.loadTracking(projectPath);
  const trackedMrs = trackingData?.mrs ?? [];

  const prompt = buildAiInsightsPrompt({
    reviews: stats.reviews,
    reviewContents,
    trackedMrs,
    language,
  });

  logger.info({ promptLength: prompt.length }, 'Dispatching --bg session for AI insights');

  const sessionResult = await session.run(prompt, projectPath);

  if (sessionResult.status === 'unavailable') {
    logger.error({ reason: sessionResult.reason }, 'AI insights session unavailable');
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  if (sessionResult.status === 'timed-out') {
    logger.error('AI insights session timed out');
    throw new Error(TIMEOUT_MESSAGE);
  }

  logger.info({ answerLength: sessionResult.answer.length }, 'Received --bg answer for AI insights');

  const result = parseAiInsightsResponse(sessionResult.answer);

  return {
    ...result,
    generatedAt: new Date().toISOString(),
  };
}
