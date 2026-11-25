import { z } from 'zod';

export const BUDGET_FLOOR_USD = 0;
export const BUDGET_CEILING_USD = 5000;
export const BUDGET_DEFAULT_USD = 200;

export const budgetConfigSchema = z.object({
  limitUsd: z.number().min(BUDGET_FLOOR_USD).max(BUDGET_CEILING_USD),
});

export type BudgetConfig = z.infer<typeof budgetConfigSchema>;
