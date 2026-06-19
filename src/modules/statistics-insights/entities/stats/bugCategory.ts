/**
 * The fixed, closed set of bug categories a review can attribute findings to.
 * Order is the canonical display order used across the slice.
 */
export const BUG_CATEGORY_KEYS = [
  'security',
  'logic',
  'performance',
  'typeSafety',
  'style',
  'dependencies',
] as const;

export type BugCategory = (typeof BUG_CATEGORY_KEYS)[number];

export const BUG_CATEGORY_LABELS: Record<BugCategory, string> = {
  security: 'Security',
  logic: 'Logic',
  performance: 'Performance',
  typeSafety: 'Type Safety',
  style: 'Style',
  dependencies: 'Dependencies',
};

export type CategoryBreakdown = Record<BugCategory, number>;

export function emptyBreakdown(): CategoryBreakdown {
  return {
    security: 0,
    logic: 0,
    performance: 0,
    typeSafety: 0,
    style: 0,
    dependencies: 0,
  };
}
