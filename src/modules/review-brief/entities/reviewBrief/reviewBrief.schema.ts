import { z } from 'zod';

const shortText = (maximumLength: number) => z.string().trim().min(1).max(maximumLength);

export const reviewBriefModelOutputSchema = z.object({
  what: shortText(600),
  problem: shortText(600),
  risks: z.array(shortText(300)).min(1).max(3),
  toCheck: z.array(shortText(300)).min(1).max(2),
  areas: z.array(shortText(60)).max(5),
});

const lineCount = z.number().int().nonnegative();

export const reviewBriefSizeSchema = z.object({
  additions: lineCount,
  deletions: lineCount,
  changedFiles: lineCount,
});

export const reviewBriefSchema = reviewBriefModelOutputSchema.extend({
  mrNumber: z.number().int().positive(),
  headSha: z.string().min(1),
  generatedAt: z.iso.datetime(),
  size: reviewBriefSizeSchema,
});

export type ReviewBriefModelOutput = z.infer<typeof reviewBriefModelOutputSchema>;
export type ReviewBriefSize = z.infer<typeof reviewBriefSizeSchema>;
export type ReviewBrief = z.infer<typeof reviewBriefSchema>;
