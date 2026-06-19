import {
  BUG_CATEGORY_KEYS,
  BUG_CATEGORY_LABELS,
  emptyBreakdown,
  type BugCategory,
} from '@/modules/statistics-insights/entities/stats/bugCategory.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';

const EMPTY_MESSAGE = 'Aucune donnée de catégorie disponible';

export interface BugsByCategoryBar {
  categoryKey: BugCategory;
  label: string;
  count: number;
}

export interface BugsByCategoryViewModel {
  bars: BugsByCategoryBar[];
  isEmpty: boolean;
  emptyMessage: string;
}

export class BugsByCategoryPresenter {
  present(stats: ProjectStats): BugsByCategoryViewModel {
    const breakdown = stats.categoryBreakdown ?? emptyBreakdown();

    const bars = BUG_CATEGORY_KEYS.map((categoryKey, index) => ({
      categoryKey,
      label: BUG_CATEGORY_LABELS[categoryKey],
      count: breakdown[categoryKey],
      index,
    }))
      .toSorted((left, right) => right.count - left.count || left.index - right.index)
      .map(({ categoryKey, label, count }) => ({ categoryKey, label, count }));

    return {
      bars,
      isEmpty: bars.every((bar) => bar.count === 0),
      emptyMessage: EMPTY_MESSAGE,
    };
  }
}
