import {
  BUG_CATEGORY_KEYS,
  BUG_CATEGORY_LABELS,
  type CategoryBreakdown,
} from '@/modules/statistics-insights/entities/stats/bugCategory.js';
import type {
  ProjectStats,
  ReviewStats,
} from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { formatReviewDuration } from '@/modules/statistics-insights/services/statsService.js';

export type KeyInsightKey = 'reviewVolume' | 'dominantCategory' | 'reviewTime';

const TREND_WINDOW = 5;
const MIN_WINDOW_SAMPLES = 3;
const TIME_MIN_RELATIVE_CHANGE = 0.1;
const VOLUME_MIN_RELATIVE_CHANGE = 0.1;
const VOLUME_PERIOD_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A single key insight derived from recorded stats. `title` and `body` are
 * generated English narrative text; `strength` is a ranking weight (larger is
 * more notable) and is never surfaced to the user.
 */
export interface KeyInsight {
  key: KeyInsightKey;
  title: string;
  body: string;
  strength: number;
}

function formatSignedPercent(relativeChange: number, sign: 'up' | 'down'): string {
  const prefix = sign === 'up' ? '+' : '-';
  return `${prefix}${Math.round(relativeChange * 100)}%`;
}

function countWithin(reviews: ReviewStats[], from: number, to: number): number {
  return reviews.filter((review) => {
    const time = new Date(review.timestamp).getTime();
    return time >= from && time < to;
  }).length;
}

function averageDuration(reviews: ReviewStats[]): number {
  return reviews.reduce((sum, review) => sum + review.duration, 0) / reviews.length;
}

function reviewVolumeInsight(reviews: ReviewStats[], now: Date): KeyInsight | null {
  const nowTime = now.getTime();
  const periodLength = VOLUME_PERIOD_DAYS * MILLISECONDS_PER_DAY;
  const recentStart = nowTime - periodLength;
  const previousStart = recentStart - periodLength;

  const recentCount = countWithin(reviews, recentStart, nowTime + 1);
  const previousCount = countWithin(reviews, previousStart, recentStart);
  if (recentCount < MIN_WINDOW_SAMPLES || previousCount < MIN_WINDOW_SAMPLES) return null;

  const relativeChange = Math.abs(recentCount - previousCount) / previousCount;
  if (relativeChange < VOLUME_MIN_RELATIVE_CHANGE) return null;

  const rising = recentCount > previousCount;

  return {
    key: 'reviewVolume',
    title: rising ? 'Review volume is up' : 'Review volume is down',
    body: `${recentCount} recent reviews vs ${previousCount} before (${formatSignedPercent(
      relativeChange,
      rising ? 'up' : 'down',
    )})`,
    strength: relativeChange,
  };
}

function dominantCategoryInsight(breakdown: CategoryBreakdown | null): KeyInsight | null {
  if (breakdown === null) return null;

  const ranked = BUG_CATEGORY_KEYS.map((categoryKey, index) => ({
    categoryKey,
    count: breakdown[categoryKey],
    index,
  })).toSorted((left, right) => right.count - left.count || left.index - right.index);

  const top = ranked[0];
  if (top.count < 1) return null;

  const totalCategorizedBugs = ranked.reduce((sum, entry) => sum + entry.count, 0);
  const label = BUG_CATEGORY_LABELS[top.categoryKey];

  return {
    key: 'dominantCategory',
    title: `${label} is the most common finding`,
    body: `${top.count} findings across all reviews`,
    strength: top.count / totalCategorizedBugs,
  };
}

function reviewTimeInsight(reviews: ReviewStats[]): KeyInsight | null {
  const recent = reviews.slice(-TREND_WINDOW);
  const previous = reviews.slice(-TREND_WINDOW * 2, -TREND_WINDOW);
  if (recent.length < MIN_WINDOW_SAMPLES || previous.length < MIN_WINDOW_SAMPLES) return null;

  const previousAverage = averageDuration(previous);
  if (previousAverage <= 0) return null;

  const recentAverage = averageDuration(recent);
  const relativeChange = Math.abs(recentAverage - previousAverage) / previousAverage;
  if (relativeChange < TIME_MIN_RELATIVE_CHANGE) return null;

  const dropped = recentAverage < previousAverage;

  return {
    key: 'reviewTime',
    title: dropped ? 'Review time dropped' : 'Review time rose',
    body: `avg ${formatReviewDuration(recentAverage)} recently vs ${formatReviewDuration(
      previousAverage,
    )} before (${formatSignedPercent(relativeChange, dropped ? 'down' : 'up')})`,
    strength: relativeChange,
  };
}

/**
 * Derive the ranked key insights from already-recorded project stats. Pure and
 * deterministic — `now` is injected so the helper never reads the wall clock.
 * Candidates that fail their data/threshold gate are omitted. The result is
 * sorted by `strength` descending and is empty when no candidate qualifies.
 */
export function deriveKeyInsights(stats: ProjectStats, now: Date): KeyInsight[] {
  const insights: KeyInsight[] = [];

  const reviewVolume = reviewVolumeInsight(stats.reviews, now);
  if (reviewVolume !== null) insights.push(reviewVolume);

  const category = dominantCategoryInsight(stats.categoryBreakdown ?? null);
  if (category !== null) insights.push(category);

  const reviewTime = reviewTimeInsight(stats.reviews);
  if (reviewTime !== null) insights.push(reviewTime);

  return insights.toSorted((left, right) => right.strength - left.strength);
}
