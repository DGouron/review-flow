import { describe, it, expect } from 'vitest';

import { BugsByCategoryPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.js';
import { ProjectStatsFactory } from '@/tests/factories/projectStats.factory.js';

describe('BugsByCategoryPresenter', () => {
  const present = (stats = ProjectStatsFactory.create()) =>
    new BugsByCategoryPresenter().present(stats);

  it('produces one bar per category, all six present', () => {
    const viewModel = present();

    expect(viewModel.bars).toHaveLength(6);
    expect(viewModel.bars.map((bar) => bar.categoryKey).toSorted()).toEqual([
      'dependencies',
      'logic',
      'performance',
      'security',
      'style',
      'typeSafety',
    ]);
  });

  it('orders bars from highest count to lowest', () => {
    const viewModel = present(
      ProjectStatsFactory.create({
        categoryBreakdown: {
          security: 3,
          logic: 5,
          performance: 0,
          typeSafety: 0,
          style: 1,
          dependencies: 0,
        },
      }),
    );

    expect(viewModel.bars.map((bar) => bar.categoryKey)).toEqual([
      'logic',
      'security',
      'style',
      'performance',
      'typeSafety',
      'dependencies',
    ]);
    expect(viewModel.bars[0]).toEqual({ categoryKey: 'logic', label: 'Logic', count: 5 });
  });

  it('breaks ties using the canonical category order', () => {
    const viewModel = present(
      ProjectStatsFactory.create({
        categoryBreakdown: {
          security: 2,
          logic: 2,
          performance: 0,
          typeSafety: 0,
          style: 0,
          dependencies: 0,
        },
      }),
    );

    expect(viewModel.bars.slice(0, 2).map((bar) => bar.categoryKey)).toEqual(['security', 'logic']);
  });

  it('flags the empty state with the French message when every count is zero', () => {
    const viewModel = present();

    expect(viewModel.isEmpty).toBe(true);
    expect(viewModel.emptyMessage).toBe('Aucune donnée de catégorie disponible');
  });

  it('is not empty when at least one category has a count', () => {
    const viewModel = present(
      ProjectStatsFactory.create({
        categoryBreakdown: {
          security: 1,
          logic: 0,
          performance: 0,
          typeSafety: 0,
          style: 0,
          dependencies: 0,
        },
      }),
    );

    expect(viewModel.isEmpty).toBe(false);
  });
});
