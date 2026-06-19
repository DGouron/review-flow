/**
 * Format a review duration in milliseconds as a human-readable string
 * (e.g. "4m", "1h 12m"). Single source of truth shared by the stats
 * summary presenter, the analytics header presenter, and key insights.
 */
export function formatReviewDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
