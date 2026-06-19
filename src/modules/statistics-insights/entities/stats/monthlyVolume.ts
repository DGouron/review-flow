import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';

/**
 * A single point of the reviews-per-month series. `month` is a calendar month
 * formatted as 'YYYY-MM' (UTC); `count` is how many reviews fell in that month.
 */
export interface MonthlyVolumePoint {
  month: string;
  count: number;
}

const MONTHS_IN_WINDOW = 12;

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function trailingMonths(now: Date): string[] {
  const months: string[] = [];
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  for (let offset = MONTHS_IN_WINDOW - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, monthIndex - offset, 1));
    months.push(monthKey(date.getUTCFullYear(), date.getUTCMonth()));
  }

  return months;
}

/**
 * Group reviews by calendar month over the trailing twelve months ending at
 * `now`. The window is zero-filled, so the result always carries exactly
 * twelve points in chronological order. `now` is injected for deterministic
 * tests — the helper never reads the wall clock itself.
 *
 * LIMITATION: `reviews` is capped at the last 100 entries by `statsService`,
 * so very active projects may undercount older months in the window.
 */
export function reviewsPerMonth(reviews: ReviewStats[], now: Date): MonthlyVolumePoint[] {
  const counts = new Map<string, number>(trailingMonths(now).map((month) => [month, 0]));

  for (const review of reviews) {
    const date = new Date(review.timestamp);
    const key = monthKey(date.getUTCFullYear(), date.getUTCMonth());
    const existing = counts.get(key);
    if (existing !== undefined) {
      counts.set(key, existing + 1);
    }
  }

  return Array.from(counts, ([month, count]) => ({ month, count }));
}
