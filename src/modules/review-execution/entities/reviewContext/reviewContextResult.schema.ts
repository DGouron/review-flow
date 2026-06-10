import { z } from 'zod';

export const measuredReviewResultSchema = z.object({
  kind: z.literal('measured'),
  blocking: z.number(),
  warnings: z.number(),
  suggestions: z.number(),
  score: z.number(),
  verdict: z.enum(['ready_to_merge', 'needs_fixes', 'needs_discussion']),
});

export const backfilledReviewResultSchema = z.object({
  kind: z.literal('backfilled'),
  backfilledAt: z.string(),
  reason: z.enum(['stale-on-boot', 'recovered-after-restart']),
});

export const reviewContextResultSchema = z.discriminatedUnion('kind', [
  measuredReviewResultSchema,
  backfilledReviewResultSchema,
]);

export type MeasuredReviewResult = z.infer<typeof measuredReviewResultSchema>;
export type BackfilledReviewResult = z.infer<typeof backfilledReviewResultSchema>;
export type ReviewContextResult = z.infer<typeof reviewContextResultSchema>;
