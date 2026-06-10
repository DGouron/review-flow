import type { MeasuredReviewResult } from './reviewContextResult.schema.js';

export interface ParsedReviewStats {
  score: number | null;
  blocking: number;
  warnings: number;
  suggestions: number;
}

export const ReviewContextResultFactory = {
  fromParsedReview(parsed: ParsedReviewStats): MeasuredReviewResult {
    return {
      kind: 'measured',
      blocking: parsed.blocking,
      warnings: parsed.warnings,
      suggestions: parsed.suggestions,
      score: parsed.score ?? 0,
      verdict: deriveVerdict(parsed),
    };
  },
};

function deriveVerdict(parsed: ParsedReviewStats): MeasuredReviewResult['verdict'] {
  if (parsed.blocking > 0) {
    return 'needs_fixes';
  }
  if (parsed.score !== null && parsed.score >= 8 && parsed.warnings === 0) {
    return 'ready_to_merge';
  }
  return 'needs_discussion';
}
