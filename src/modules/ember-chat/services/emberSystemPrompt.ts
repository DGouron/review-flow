import type { EmberMemory } from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';
import type { PersistedInsightsData } from '@/modules/statistics-insights/entities/insight/persistedInsightsData.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { MrTrackingData } from '@/modules/tracking/entities/tracking/mrTrackingData.js';
import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export interface EmberGrounding {
  reviewScores: ProjectStats | null;
  insights: PersistedInsightsData | null;
  jobHistory: MrTrackingData | null;
  worktrees: WorktreeEntry[];
  memory: EmberMemory | null;
}

const MAX_RECENT_REVIEWS = 20;
const MAX_RECENT_MRS = 20;
const MAX_DEVELOPERS = 10;
const MAX_DEVELOPER_RECENT_REVIEWS = 5;
const MAX_WORKTREES = 20;

function boundReviewScores(stats: ProjectStats | null): ProjectStats | null {
  if (stats === null) {
    return null;
  }
  return { ...stats, reviews: mostRecent(stats.reviews, MAX_RECENT_REVIEWS) };
}

function boundJobHistory(jobHistory: MrTrackingData | null): MrTrackingData | null {
  if (jobHistory === null) {
    return null;
  }
  return { ...jobHistory, mrs: mostRecent(jobHistory.mrs, MAX_RECENT_MRS) };
}

function boundInsights(insights: PersistedInsightsData | null): PersistedInsightsData | null {
  if (insights === null) {
    return null;
  }
  return {
    ...insights,
    developers: mostRecent(insights.developers, MAX_DEVELOPERS).map((developer) => ({
      ...developer,
      recentReviews: mostRecent(developer.recentReviews, MAX_DEVELOPER_RECENT_REVIEWS),
    })),
    processedReviewIds: mostRecent(insights.processedReviewIds, MAX_RECENT_REVIEWS),
  };
}

function mostRecent<Item>(items: ReadonlyArray<Item>, limit: number): Item[] {
  return items.slice(Math.max(0, items.length - limit));
}

function conversationMemorySection(memory: EmberMemory | null): string {
  if (memory === null || memory.turns.length === 0) {
    return '';
  }
  const turns = memory.turns
    .map((turn, index) => `${index + 1}. Question : ${turn.question}\n   Réponse : ${turn.answer}`)
    .join('\n');
  return [
    '',
    'MÉMOIRE — conversation précédente sur ce projet (tours antérieurs) :',
    "Sers-t'en pour comprendre une question de suivi sans répéter le sujet.",
    turns,
  ].join('\n');
}

function recurringInsightsSection(memory: EmberMemory | null): string {
  if (memory === null || memory.insights.length === 0) {
    return '';
  }
  const insights = memory.insights.map((insight) => `- ${insight}`).join('\n');
  return [
    '',
    'CONSTATS RÉCURRENTS — déjà dérivés des données de review de ce projet :',
    'Réutilise-les tels quels plutôt que de les recalculer.',
    insights,
  ].join('\n');
}

function reviewCountSummary(stats: ProjectStats | null): string {
  if (stats === null || stats.reviews.length <= MAX_RECENT_REVIEWS) {
    return '';
  }
  const olderCount = stats.reviews.length - MAX_RECENT_REVIEWS;
  return `… et ${olderCount} reviews plus anciennes que tu peux lire à la demande dans les données du projet.`;
}

export function buildEmberSystemPrompt(grounding: EmberGrounding): string {
  const reviewScores = boundReviewScores(grounding.reviewScores);
  const olderReviewsNote = reviewCountSummary(grounding.reviewScores);
  return [
    "Tu es Ember, l'assistant conversationnel du tableau de bord ReviewFlow.",
    '',
    'Ces données de review du projet, fournies ci-dessous, sont ton point de départ :',
    'un instantané des éléments les plus récents, fourni pour te faire gagner du temps.',
    "Ce n'est PAS une limite. Tu peux lire à la demande les données de review du projet",
    "sur disque pour répondre au sujet de n'importe quel élément, récent ou ancien,",
    'même au-delà de cet instantané. Ne refuse jamais une question au seul motif',
    "qu'un élément se trouve hors de cet instantané récent.",
    '',
    'reviewScores (scores et statistiques de review, instantané récent) :',
    JSON.stringify(reviewScores),
    olderReviewsNote,
    '',
    'insights (insights développeur et équipe) :',
    JSON.stringify(boundInsights(grounding.insights)),
    '',
    'jobHistory (historique des jobs de review) :',
    JSON.stringify(boundJobHistory(grounding.jobHistory)),
    '',
    'worktrees (état des worktrees) :',
    JSON.stringify(mostRecent(grounding.worktrees, MAX_WORKTREES)),
    recurringInsightsSection(grounding.memory),
    conversationMemorySection(grounding.memory),
    '',
    'GROUNDING : réponds uniquement à partir des données de review du projet,',
    "qu'elles soient dans cet instantané ou lues à la demande sur disque.",
    'Si la réponse ne se trouve dans aucune de ces données, dis que tu ne sais répondre',
    "qu'à propos des reviews plutôt que d'inventer une réponse. N'invente jamais.",
    '',
    'LECTURE SEULE : tu ne modifies, ne crées et ne supprimes rien. Si on te demande',
    "d'écrire, de créer ou de modifier quelque chose (par exemple un quality gate),",
    "explique que tu restes en lecture seule et n'effectue aucune écriture.",
  ].join('\n');
}
