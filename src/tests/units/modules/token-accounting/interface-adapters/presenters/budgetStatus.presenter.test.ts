import { describe, it, expect } from 'vitest';

import type { BudgetStatus } from '@/modules/token-accounting/entities/budget/budgetStatus.js';
import { BudgetStatusPresenter } from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';

function makeStatus(overrides: Partial<BudgetStatus> = {}): BudgetStatus {
  return {
    limitUsd: 200,
    consumedUsd: 48.5,
    remainingUsd: 151.5,
    percentUsed: 24.25,
    exceeded: false,
    periodStart: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('BudgetStatusPresenter', () => {
  const presenter = new BudgetStatusPresenter();

  it('formats every USD field as $X.XX', () => {
    const vm = presenter.present(makeStatus());

    expect(vm.limitUsdFormatted).toBe('$200.00');
    expect(vm.consumedUsdFormatted).toBe('$48.50');
    expect(vm.remainingUsdFormatted).toBe('$151.50');
  });

  it('formats percentUsed with two decimals and a percent sign', () => {
    const vm = presenter.present(makeStatus({ percentUsed: 24.25 }));

    expect(vm.percentUsedFormatted).toBe('24.25%');
  });

  it('clamps gaugeWidthPercent at 100 when consumed exceeds limit', () => {
    const vm = presenter.present(makeStatus({ percentUsed: 125.4, exceeded: true }));

    expect(vm.gaugeWidthPercent).toBe(100);
    expect(vm.exceeded).toBe(true);
  });

  it('keeps gaugeWidthPercent equal to percentUsed when under 100', () => {
    const vm = presenter.present(makeStatus({ percentUsed: 24.25 }));

    expect(vm.gaugeWidthPercent).toBe(24.25);
  });

  it('passes through the periodStart ISO unchanged', () => {
    const vm = presenter.present(makeStatus({ periodStart: '2026-06-01T00:00:00.000Z' }));

    expect(vm.periodStart).toBe('2026-06-01T00:00:00.000Z');
  });
});
