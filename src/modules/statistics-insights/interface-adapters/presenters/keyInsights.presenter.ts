import { deriveKeyInsights } from '@/modules/statistics-insights/entities/stats/keyInsights.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';

const MAX_CARDS = 3;
const EMPTY_MESSAGE = 'Aucun insight disponible pour le moment';

export interface KeyInsightCard {
  title: string;
  body: string;
}

export interface KeyInsightsViewModel {
  cards: KeyInsightCard[];
  isEmpty: boolean;
  emptyMessage: string;
}

export class KeyInsightsPresenter {
  present(stats: ProjectStats, now: Date): KeyInsightsViewModel {
    const cards = deriveKeyInsights(stats, now)
      .slice(0, MAX_CARDS)
      .map(({ title, body }) => ({ title, body }));

    return {
      cards,
      isEmpty: cards.length === 0,
      emptyMessage: EMPTY_MESSAGE,
    };
  }
}
