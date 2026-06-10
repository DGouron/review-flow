import { describe, it, expect, beforeEach } from 'vitest';

import { UpdateBudgetUseCase } from '@/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.js';
import { StubBudgetGateway } from '@/tests/stubs/budget.stub.js';

describe('UpdateBudgetUseCase', () => {
  let budgetGateway: StubBudgetGateway;
  let useCase: UpdateBudgetUseCase;

  beforeEach(() => {
    budgetGateway = new StubBudgetGateway();
    useCase = new UpdateBudgetUseCase({ budgetGateway });
  });

  it('saves a valid limit and returns success', async () => {
    await budgetGateway.save({ limitUsd: 200 });
    const initialSaveCount = budgetGateway.saveCount;

    const result = await useCase.execute({ limitUsd: 350 });

    expect(result).toEqual({ success: true, limitUsd: 350 });
    expect(budgetGateway.saveCount).toBe(initialSaveCount + 1);
    const persisted = await budgetGateway.load();
    expect(persisted).toEqual({ limitUsd: 350 });
  });

  it('rejects a limit above 600 with a range error and does not persist', async () => {
    await budgetGateway.save({ limitUsd: 200 });
    const saveCountBefore = budgetGateway.saveCount;

    const result = await useCase.execute({ limitUsd: 750 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('limitUsd must be between 0 and 600');
    }
    expect(budgetGateway.saveCount).toBe(saveCountBefore);
    const persisted = await budgetGateway.load();
    expect(persisted).toEqual({ limitUsd: 200 });
  });

  it('rejects a negative limit with the same range error', async () => {
    const result = await useCase.execute({ limitUsd: -10 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('limitUsd must be between 0 and 600');
    }
  });

  it('allows setting a limit below the current consumption (R5)', async () => {
    await budgetGateway.save({ limitUsd: 500 });

    const result = await useCase.execute({ limitUsd: 50 });

    expect(result).toEqual({ success: true, limitUsd: 50 });
  });

  it('accepts the boundaries 0 and 600', async () => {
    const floor = await useCase.execute({ limitUsd: 0 });
    expect(floor.success).toBe(true);

    const ceiling = await useCase.execute({ limitUsd: 600 });
    expect(ceiling.success).toBe(true);
  });
});
