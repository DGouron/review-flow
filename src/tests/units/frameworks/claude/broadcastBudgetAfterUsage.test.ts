import { describe, it, expect, vi } from 'vitest';

import { broadcastBudgetAfterUsage } from '@/frameworks/claude/broadcastBudgetAfterUsage.js';
import { BudgetStatusPresenter } from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

const status = {
  limitUsd: 200,
  consumedUsd: 50,
  remainingUsd: 150,
  percentUsed: 25,
  exceeded: false,
  periodStart: '2026-05-01T00:00:00.000Z',
};

describe('broadcastBudgetAfterUsage', () => {
  it('calls broadcastBudgetStatus with the presented view model of the recomputed status', async () => {
    const presenter = new BudgetStatusPresenter();
    const getBudgetStatus = { execute: vi.fn(async () => status) };
    const broadcastBudgetStatus = vi.fn();
    const logger = createStubLogger();

    await broadcastBudgetAfterUsage(
      { getBudgetStatus, broadcastBudgetStatus, presenter },
      { localPaths: ['/project'] },
      logger,
    );

    expect(getBudgetStatus.execute).toHaveBeenCalledWith({ localPaths: ['/project'] });
    expect(broadcastBudgetStatus).toHaveBeenCalledTimes(1);
    expect(broadcastBudgetStatus).toHaveBeenCalledWith(presenter.present(status));
  });

  it('swallows errors from getBudgetStatus so the review result is never blocked', async () => {
    const presenter = new BudgetStatusPresenter();
    const getBudgetStatus = {
      execute: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const broadcastBudgetStatus = vi.fn();
    const logger = createStubLogger();

    await expect(
      broadcastBudgetAfterUsage(
        { getBudgetStatus, broadcastBudgetStatus, presenter },
        { localPaths: ['/project'] },
        logger,
      ),
    ).resolves.toBeUndefined();

    expect(broadcastBudgetStatus).not.toHaveBeenCalled();
  });
});
