import { z } from 'zod';

const nonNegativeCount = z.number().int().nonnegative();

export const categoryBreakdownSchema = z.object({
  security: nonNegativeCount,
  logic: nonNegativeCount,
  performance: nonNegativeCount,
  typeSafety: nonNegativeCount,
  style: nonNegativeCount,
  dependencies: nonNegativeCount,
});
