import { describe, it, expect } from 'vitest';

import { budgetConfigGuard } from '@/modules/token-accounting/entities/budget/budgetConfig.guard.js';
import {
  BUDGET_FLOOR_USD,
  BUDGET_CEILING_USD,
  BUDGET_DEFAULT_USD,
} from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';

describe('budgetConfigGuard', () => {
  it('accepts a config with limitUsd at the default 200', () => {
    const result = budgetConfigGuard.safeParse({ limitUsd: BUDGET_DEFAULT_USD });
    expect(result.success).toBe(true);
  });

  it('accepts the floor 0', () => {
    const result = budgetConfigGuard.safeParse({ limitUsd: BUDGET_FLOOR_USD });
    expect(result.success).toBe(true);
  });

  it('accepts the ceiling 5000, above a month of reviews priced at API rates', () => {
    expect(BUDGET_CEILING_USD).toBe(5000);
    expect(budgetConfigGuard.safeParse({ limitUsd: 2000 }).success).toBe(true);
    expect(budgetConfigGuard.safeParse({ limitUsd: BUDGET_CEILING_USD }).success).toBe(true);
  });

  it('rejects a limit above 5000', () => {
    const result = budgetConfigGuard.safeParse({ limitUsd: 5001 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative limit', () => {
    const result = budgetConfigGuard.safeParse({ limitUsd: -10 });
    expect(result.success).toBe(false);
  });

  it('rejects a missing limitUsd field', () => {
    const result = budgetConfigGuard.safeParse({});
    expect(result.success).toBe(false);
  });
});
