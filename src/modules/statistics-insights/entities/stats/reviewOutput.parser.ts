import type { CategoryBreakdown } from '@/modules/statistics-insights/entities/stats/bugCategory.js';
import { normalizeBreakdown } from '@/modules/statistics-insights/entities/stats/categoryBreakdown.guard.js';

/**
 * Parse review output to extract statistics
 *
 * Supports two formats:
 * 1. Summary format (from skill output):
 *    Score global : X/10
 *    Bloquants : X
 *    Importants : X
 *
 * 2. Structured stats line:
 *    [REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]
 *
 * 3. Inline markers (fallback):
 *    [BLOQUANT], [IMPORTANT], [SUGGESTION]
 *
 * The structured stats line may carry an optional categories segment:
 *    [REVIEW_STATS:...:categories=security=3,logic=5,performance=1]
 * Absent segment yields a null breakdown (legacy / no category data).
 */
export interface ParsedReviewOutput {
  score: number | null;
  blocking: number;
  warnings: number;
  suggestions: number;
  categoryBreakdown: CategoryBreakdown | null;
}

function parseCategoriesSegment(statsStr: string): CategoryBreakdown | null {
  const categoriesMatch = statsStr.match(/categories=([^:]+)/i);
  if (!categoriesMatch) return null;

  const rawCounts: Record<string, number> = {};
  for (const pair of categoriesMatch[1].split(',')) {
    const [key, value] = pair.split('=');
    const count = Number.parseInt(value, 10);
    if (key && Number.isInteger(count)) {
      rawCounts[key.trim()] = count;
    }
  }

  return normalizeBreakdown(rawCounts);
}

export function parseReviewOutput(stdout: string): ParsedReviewOutput {
  let score: number | null = null;
  let blocking = 0;
  let warnings = 0;
  let suggestions = 0;

  // Method 1: Parse structured stats line (most reliable)
  // Format: [REVIEW_STATS:blocking=1:warnings=2:suggestions=3:score=7.5]
  const statsLineMatch = stdout.match(/\[REVIEW_STATS:([^\]]+)\]/i);
  if (statsLineMatch) {
    const statsStr = statsLineMatch[1];
    const blockingMatch = statsStr.match(/blocking=(\d+)/);
    const warningsMatch = statsStr.match(/warnings=(\d+)/);
    const suggestionsMatch = statsStr.match(/suggestions=(\d+)/);
    const scoreMatch = statsStr.match(/score=(\d+(?:\.\d+)?)/);

    if (blockingMatch) blocking = Number.parseInt(blockingMatch[1], 10);
    if (warningsMatch) warnings = Number.parseInt(warningsMatch[1], 10);
    if (suggestionsMatch) suggestions = Number.parseInt(suggestionsMatch[1], 10);
    if (scoreMatch) score = Number.parseFloat(scoreMatch[1]);

    return {
      score,
      blocking,
      warnings,
      suggestions,
      categoryBreakdown: parseCategoriesSegment(statsStr),
    };
  }

  // Method 2: Parse summary format (skill output)
  const scoreMatch = stdout.match(/Score\s+[Gg]lobal\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if (scoreMatch) {
    score = Number.parseFloat(scoreMatch[1]);
  }

  const blockingSummary = stdout.match(/🚨\s*Bloquants?\s*:\s*(\d+)/i);
  if (blockingSummary) {
    blocking = Number.parseInt(blockingSummary[1], 10);
  }

  const warningsSummary = stdout.match(/⚠️\s*Importants?\s*:\s*(\d+)/i);
  if (warningsSummary) {
    warnings = Number.parseInt(warningsSummary[1], 10);
  }

  const suggestionsSummary = stdout.match(
    /(?:📝|💡)\s*(?:Améliorations?|Suggestions?)[^:]*:\s*(\d+)/i,
  );
  if (suggestionsSummary) {
    suggestions = Number.parseInt(suggestionsSummary[1], 10);
  }

  // If summary format worked, return
  if (blockingSummary || warningsSummary || suggestionsSummary) {
    return { score, blocking, warnings, suggestions, categoryBreakdown: null };
  }

  // Method 3: Fallback - count inline markers
  const blockingMatches = stdout.match(/🚨\s*\*?\*?\[BLOQUANT\]/gi);
  if (blockingMatches) {
    blocking = blockingMatches.length;
  }

  const blockingSection = stdout.match(/##\s+Corrections?\s+Bloquantes?[\s\S]*?(?=##\s|$)/i);
  if (blockingSection) {
    const blockingHeaders = blockingSection[0].match(/^###\s+\d+\./gm);
    if (blockingHeaders && blockingHeaders.length > blocking) {
      blocking = blockingHeaders.length;
    }
  }

  const warningMatches = stdout.match(/⚠️\s*\*?\*?\[IMPORTANT\]/gi);
  if (warningMatches) {
    warnings = warningMatches.length;
  }

  const warningSection = stdout.match(/##\s+Corrections?\s+Importantes?[\s\S]*?(?=##\s|$)/i);
  if (warningSection) {
    const warningHeaders = warningSection[0].match(/^###\s+\d+\./gm);
    if (warningHeaders && warningHeaders.length > warnings) {
      warnings = warningHeaders.length;
    }
  }

  const suggestionMatches = stdout.match(/💡\s*\*?\*?\[SUGGESTION\]/gi);
  if (suggestionMatches) {
    suggestions = suggestionMatches.length;
  }

  const suggestionSection = stdout.match(/##\s+Suggestions?[\s\S]*?(?=##\s|$)/i);
  if (suggestionSection) {
    const suggestionHeaders = suggestionSection[0].match(/^###\s+\d+\./gm);
    if (suggestionHeaders && suggestionHeaders.length > suggestions) {
      suggestions = suggestionHeaders.length;
    }
  }

  return { score, blocking, warnings, suggestions, categoryBreakdown: null };
}
