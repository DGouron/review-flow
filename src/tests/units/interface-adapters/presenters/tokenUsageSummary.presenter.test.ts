import { describe, it, expect } from 'vitest';

import { TokenUsageSummaryPresenter } from '@/modules/token-accounting/interface-adapters/presenters/tokenUsageSummary.presenter.js';
import type { TokenUsageSummary } from '@/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.js';

const emptySummary: TokenUsageSummary = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheRead: 0,
  totalCacheCreation: 0,
  totalCostUsd: 0,
  recordCount: 0,
  byModel: {},
};

describe('TokenUsageSummaryPresenter', () => {
  describe('non-empty summary', () => {
    it('formats the total cost in dollars with 2 decimals', () => {
      const presenter = new TokenUsageSummaryPresenter();
      const summary: TokenUsageSummary = {
        ...emptySummary,
        totalCostUsd: 1.2345,
        totalInputTokens: 100,
        totalOutputTokens: 200,
        recordCount: 1,
        byModel: { 'claude-sonnet-4-6': { count: 1, costUsd: 1.2345 } },
      };

      const viewModel = presenter.present(summary);

      expect(viewModel.totalCostUsd).toBe('$1.23');
    });

    it('exposes record count and total input+output tokens', () => {
      const presenter = new TokenUsageSummaryPresenter();
      const summary: TokenUsageSummary = {
        ...emptySummary,
        totalInputTokens: 1500,
        totalOutputTokens: 500,
        totalCacheRead: 999,
        recordCount: 3,
        totalCostUsd: 0.5,
        byModel: { 'claude-opus-4-7': { count: 3, costUsd: 0.5 } },
      };

      const viewModel = presenter.present(summary);

      expect(viewModel.recordCount).toBe(3);
      // Cache tokens excluded from headline number to keep the tile readable.
      expect(viewModel.totalTokens).toBe(2000);
    });

    it('sorts models by cost descending and computes cost share', () => {
      const presenter = new TokenUsageSummaryPresenter();
      const summary: TokenUsageSummary = {
        ...emptySummary,
        recordCount: 4,
        totalCostUsd: 1,
        byModel: {
          'claude-sonnet-4-6': { count: 3, costUsd: 0.3 },
          'claude-opus-4-7': { count: 1, costUsd: 0.7 },
        },
      };

      const viewModel = presenter.present(summary);

      expect(viewModel.models).toHaveLength(2);
      expect(viewModel.models[0].name).toBe('claude-opus-4-7');
      expect(viewModel.models[0].count).toBe(1);
      expect(viewModel.models[0].costUsd).toBe('$0.70');
      expect(viewModel.models[0].costShare).toBe('70%');
      expect(viewModel.models[1].name).toBe('claude-sonnet-4-6');
      expect(viewModel.models[1].costShare).toBe('30%');
    });

    it('flags non-empty summaries with isEmpty false', () => {
      const presenter = new TokenUsageSummaryPresenter();
      const summary: TokenUsageSummary = {
        ...emptySummary,
        recordCount: 1,
        byModel: { 'claude-sonnet-4-6': { count: 1, costUsd: 0.1 } },
      };

      expect(presenter.present(summary).isEmpty).toBe(false);
    });
  });

  describe('empty summary', () => {
    it('flags isEmpty true when no records', () => {
      const presenter = new TokenUsageSummaryPresenter();

      expect(presenter.present(emptySummary).isEmpty).toBe(true);
    });

    it('returns $0.00 cost and 0 totals when empty', () => {
      const presenter = new TokenUsageSummaryPresenter();

      const viewModel = presenter.present(emptySummary);

      expect(viewModel.totalCostUsd).toBe('$0.00');
      expect(viewModel.totalTokens).toBe(0);
      expect(viewModel.recordCount).toBe(0);
      expect(viewModel.models).toEqual([]);
    });
  });

  describe('cost share edge cases', () => {
    it('handles zero total cost gracefully (no division by zero)', () => {
      const presenter = new TokenUsageSummaryPresenter();
      const summary: TokenUsageSummary = {
        ...emptySummary,
        recordCount: 2,
        totalCostUsd: 0,
        byModel: {
          'claude-sonnet-4-6': { count: 2, costUsd: 0 },
        },
      };

      const viewModel = presenter.present(summary);

      expect(viewModel.models[0].costShare).toBe('0%');
    });
  });
});
