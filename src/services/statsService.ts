import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Individual review statistics
 */
export interface ReviewStats {
  id: string; // unique identifier (timestamp-based)
  timestamp: string; // ISO 8601 timestamp
  mrNumber: number;
  duration: number; // milliseconds
  score: number | null; // global score /10, null if not parseable
  blocking: number; // count of blocking issues
  warnings: number; // count of warnings/important issues
  suggestions?: number; // count of suggestions
  assignedBy?: string; // username of person who assigned the review
}

/**
 * Aggregated project statistics
 */
export interface ProjectStats {
  totalReviews: number;
  totalDuration: number; // milliseconds
  averageScore: number | null;
  averageDuration: number; // milliseconds
  totalBlocking: number;
  totalWarnings: number;
  reviews: ReviewStats[];
  lastUpdated: string;
}

/**
 * Get the stats file path for a project
 */
function getStatsPath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'stats.json');
}

/**
 * Load project statistics
 */
export function loadProjectStats(projectPath: string): ProjectStats {
  const statsPath = getStatsPath(projectPath);

  if (!existsSync(statsPath)) {
    return createEmptyStats();
  }

  try {
    const content = readFileSync(statsPath, 'utf-8');
    const stats = JSON.parse(content) as ProjectStats;

    // Ensure arrays exist
    if (!Array.isArray(stats.reviews)) {
      stats.reviews = [];
    }

    return stats;
  } catch {
    return createEmptyStats();
  }
}

/**
 * Save project statistics
 */
export function saveProjectStats(projectPath: string, stats: ProjectStats): void {
  const statsPath = getStatsPath(projectPath);

  // Ensure directory exists
  const dir = dirname(statsPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  stats.lastUpdated = new Date().toISOString();
  writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf-8');
}

/**
 * Create empty stats object
 */
function createEmptyStats(): ProjectStats {
  return {
    totalReviews: 0,
    totalDuration: 0,
    averageScore: null,
    averageDuration: 0,
    totalBlocking: 0,
    totalWarnings: 0,
    reviews: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Parse review output to extract statistics
 *
 * Supports two formats:
 * 1. Summary format (from skill output):
 *    📊 Score global : X/10
 *    🚨 Bloquants : X
 *    ⚠️ Importants : X
 *
 * 2. Structured stats line:
 *    [REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]
 *
 * 3. Inline markers (fallback):
 *    🚨 [BLOQUANT], ⚠️ [IMPORTANT], 💡 [SUGGESTION]
 */
export function parseReviewOutput(stdout: string): {
  score: number | null;
  blocking: number;
  warnings: number;
  suggestions: number;
} {
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

    if (blockingMatch) blocking = parseInt(blockingMatch[1], 10);
    if (warningsMatch) warnings = parseInt(warningsMatch[1], 10);
    if (suggestionsMatch) suggestions = parseInt(suggestionsMatch[1], 10);
    if (scoreMatch) score = parseFloat(scoreMatch[1]);

    return { score, blocking, warnings, suggestions };
  }

  // Method 2: Parse summary format (skill output)
  // 📊 Score global : X/10
  const scoreMatch = stdout.match(/Score\s+[Gg]lobal\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if (scoreMatch) {
    score = parseFloat(scoreMatch[1]);
  }

  // 🚨 Bloquants : X (summary count)
  const blockingSummary = stdout.match(/🚨\s*Bloquants?\s*:\s*(\d+)/i);
  if (blockingSummary) {
    blocking = parseInt(blockingSummary[1], 10);
  }

  // ⚠️ Importants : X (summary count)
  const warningsSummary = stdout.match(/⚠️\s*Importants?\s*:\s*(\d+)/i);
  if (warningsSummary) {
    warnings = parseInt(warningsSummary[1], 10);
  }

  // 📝 Améliorations/Suggestions : X (summary count)
  const suggestionsSummary = stdout.match(/(?:📝|💡)\s*(?:Améliorations?|Suggestions?)[^:]*:\s*(\d+)/i);
  if (suggestionsSummary) {
    suggestions = parseInt(suggestionsSummary[1], 10);
  }

  // If summary format worked, return
  if (blockingSummary || warningsSummary || suggestionsSummary) {
    return { score, blocking, warnings, suggestions };
  }

  // Method 3: Fallback - count inline markers
  // 🚨 [BLOQUANT] or 🚨 **[BLOQUANT]**
  const blockingMatches = stdout.match(/🚨\s*\*?\*?\[BLOQUANT\]/gi);
  if (blockingMatches) {
    blocking = blockingMatches.length;
  }

  // Alternative: count "### " headers under "## Corrections Bloquantes"
  const blockingSection = stdout.match(/##\s+Corrections?\s+Bloquantes?[\s\S]*?(?=##\s|$)/i);
  if (blockingSection) {
    const blockingHeaders = blockingSection[0].match(/^###\s+\d+\./gm);
    if (blockingHeaders && blockingHeaders.length > blocking) {
      blocking = blockingHeaders.length;
    }
  }

  // ⚠️ [IMPORTANT] or ⚠️ **[IMPORTANT]**
  const warningMatches = stdout.match(/⚠️\s*\*?\*?\[IMPORTANT\]/gi);
  if (warningMatches) {
    warnings = warningMatches.length;
  }

  // Alternative: count "### " headers under "## Corrections Importantes"
  const warningSection = stdout.match(/##\s+Corrections?\s+Importantes?[\s\S]*?(?=##\s|$)/i);
  if (warningSection) {
    const warningHeaders = warningSection[0].match(/^###\s+\d+\./gm);
    if (warningHeaders && warningHeaders.length > warnings) {
      warnings = warningHeaders.length;
    }
  }

  // 💡 [SUGGESTION] or 💡 **[SUGGESTION]**
  const suggestionMatches = stdout.match(/💡\s*\*?\*?\[SUGGESTION\]/gi);
  if (suggestionMatches) {
    suggestions = suggestionMatches.length;
  }

  // Alternative: count "### " headers under "## Suggestions"
  const suggestionSection = stdout.match(/##\s+Suggestions?[\s\S]*?(?=##\s|$)/i);
  if (suggestionSection) {
    const suggestionHeaders = suggestionSection[0].match(/^###\s+\d+\./gm);
    if (suggestionHeaders && suggestionHeaders.length > suggestions) {
      suggestions = suggestionHeaders.length;
    }
  }

  return { score, blocking, warnings, suggestions };
}

/**
 * Add a review to project statistics
 */
export function addReviewStats(
  projectPath: string,
  mrNumber: number,
  duration: number,
  stdout: string,
  assignedBy?: string
): ReviewStats {
  const stats = loadProjectStats(projectPath);
  const parsed = parseReviewOutput(stdout);

  const now = new Date();
  const reviewStats: ReviewStats = {
    id: `${now.getTime()}-${mrNumber}`,
    timestamp: now.toISOString(),
    mrNumber,
    duration,
    score: parsed.score,
    blocking: parsed.blocking,
    warnings: parsed.warnings,
    suggestions: parsed.suggestions,
    assignedBy,
  };

  // Add to reviews array
  stats.reviews.push(reviewStats);

  // Keep only last 100 reviews
  if (stats.reviews.length > 100) {
    stats.reviews = stats.reviews.slice(-100);
  }

  // Recalculate aggregates
  stats.totalReviews = stats.reviews.length;
  stats.totalDuration = stats.reviews.reduce((sum, r) => sum + r.duration, 0);
  stats.averageDuration = stats.totalDuration / stats.totalReviews;
  stats.totalBlocking = stats.reviews.reduce((sum, r) => sum + r.blocking, 0);
  stats.totalWarnings = stats.reviews.reduce((sum, r) => sum + r.warnings, 0);

  // Calculate average score (only from reviews with scores)
  const reviewsWithScore = stats.reviews.filter((r) => r.score !== null);
  if (reviewsWithScore.length > 0) {
    stats.averageScore =
      reviewsWithScore.reduce((sum, r) => sum + (r.score ?? 0), 0) / reviewsWithScore.length;
  } else {
    stats.averageScore = null;
  }

  saveProjectStats(projectPath, stats);

  return reviewStats;
}

/**
 * Get statistics summary for display
 */
export function getStatsSummary(stats: ProjectStats): {
  totalReviews: number;
  totalTime: string;
  averageTime: string;
  averageScore: string;
  totalBlocking: number;
  totalWarnings: number;
  trend: { score: 'up' | 'down' | 'stable'; blocking: 'up' | 'down' | 'stable' };
} {
  const formatDuration = (ms: number): string => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Calculate trend based on last 5 vs previous 5 reviews
  const recent = stats.reviews.slice(-5);
  const previous = stats.reviews.slice(-10, -5);

  let scoreTrend: 'up' | 'down' | 'stable' = 'stable';
  let blockingTrend: 'up' | 'down' | 'stable' = 'stable';

  if (recent.length >= 3 && previous.length >= 3) {
    const recentScores = recent.filter((r) => r.score !== null);
    const prevScores = previous.filter((r) => r.score !== null);

    if (recentScores.length > 0 && prevScores.length > 0) {
      const avgRecent = recentScores.reduce((s, r) => s + (r.score ?? 0), 0) / recentScores.length;
      const avgPrev = prevScores.reduce((s, r) => s + (r.score ?? 0), 0) / prevScores.length;
      if (avgRecent > avgPrev + 0.5) scoreTrend = 'up';
      else if (avgRecent < avgPrev - 0.5) scoreTrend = 'down';
    }

    const avgBlockingRecent = recent.reduce((s, r) => s + r.blocking, 0) / recent.length;
    const avgBlockingPrev = previous.reduce((s, r) => s + r.blocking, 0) / previous.length;
    if (avgBlockingRecent < avgBlockingPrev - 0.5) blockingTrend = 'up'; // fewer blocking = good = up
    else if (avgBlockingRecent > avgBlockingPrev + 0.5) blockingTrend = 'down';
  }

  return {
    totalReviews: stats.totalReviews,
    totalTime: formatDuration(stats.totalDuration),
    averageTime: formatDuration(stats.averageDuration),
    averageScore: stats.averageScore !== null ? stats.averageScore.toFixed(1) : '-',
    totalBlocking: stats.totalBlocking,
    totalWarnings: stats.totalWarnings,
    trend: { score: scoreTrend, blocking: blockingTrend },
  };
}
