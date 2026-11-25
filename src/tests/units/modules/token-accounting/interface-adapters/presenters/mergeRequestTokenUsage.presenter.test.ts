import { describe, it, expect } from 'vitest';

import { MergeRequestTokenUsagePresenter } from '@/modules/token-accounting/interface-adapters/presenters/mergeRequestTokenUsage.presenter.js';
import {
  TokenUsageFactory,
  TokenUsageRecordFactory,
} from '@/tests/factories/tokenUsage.factory.js';

const sessionOf = (
  usage: Partial<ReturnType<typeof TokenUsageFactory.create>>,
  durationMs?: number,
  turns?: number,
) =>
  TokenUsageRecordFactory.create({
    model: 'claude-opus-5-5',
    durationMs,
    turns,
    usage: TokenUsageFactory.create(usage),
  });

describe('MergeRequestTokenUsagePresenter', () => {
  const presenter = new MergeRequestTokenUsagePresenter();

  it('shows one row per session, with its model, duration, turns, tokens and cost', () => {
    const viewModel = presenter.present({
      sessions: [
        sessionOf(
          {
            inputTokens: 40,
            outputTokens: 7010,
            cacheCreationInputTokens: 113_443,
            cacheReadInputTokens: 2_529_566,
            costUsd: 1.5538,
          },
          240_000,
          21,
        ),
      ],
      projectMedianCostUsd: null,
    });

    expect(viewModel.sessions[0]).toMatchObject({
      jobType: 'review',
      model: 'claude-opus-5-5',
      durationMinutes: 4,
      turns: 21,
      cacheReadTokens: 2_529_566,
      cacheWriteTokens: 113_443,
      outputTokens: 7010,
      costUsd: '$1.55',
    });
  });

  it('leaves duration and turns empty for a session recorded before they were', () => {
    const viewModel = presenter.present({ sessions: [sessionOf({})], projectMedianCostUsd: null });

    expect(viewModel.sessions[0]).toMatchObject({ durationMinutes: null, turns: null });
  });

  it('totals the review and says how much of it was context read again from the cache', () => {
    const viewModel = presenter.present({
      sessions: [
        sessionOf({
          inputTokens: 0,
          outputTokens: 50,
          cacheCreationInputTokens: 50,
          cacheReadInputTokens: 900,
          costUsd: 1,
        }),
        sessionOf({
          inputTokens: 0,
          outputTokens: 50,
          cacheCreationInputTokens: 50,
          cacheReadInputTokens: 900,
          costUsd: 2,
        }),
      ],
      projectMedianCostUsd: null,
    });

    expect(viewModel.total.costUsd).toBe('$3.00');
    expect(viewModel.total.cacheReadTokens).toBe(1800);
    expect(viewModel.cacheReadSharePercent).toBe(90);
  });

  it('compares the review with the median review of the project', () => {
    const viewModel = presenter.present({
      sessions: [sessionOf({ costUsd: 3.6 })],
      projectMedianCostUsd: 2,
    });

    expect(viewModel.costVsProjectMedian).toBe(1.8);
  });

  it('is empty when no session was recorded for the report', () => {
    const viewModel = presenter.present({ sessions: [], projectMedianCostUsd: 2 });

    expect(viewModel.isEmpty).toBe(true);
    expect(viewModel.cacheReadSharePercent).toBeNull();
    expect(viewModel.costVsProjectMedian).toBeNull();
  });
});
