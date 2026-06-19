# SPEC-204 — Show the analytics overview header — Implementation Report

**Status**: implemented · **Date**: 2026-06-19 · `yarn verify` GREEN (459 files, 3819 tests)

## Summary

Presenter-first read-only slice over the existing `ProjectStats`. Surfaces three KPI cards (PRs Reviewed, Bugs Caught, Average Review Time) and a monthly "PRs Reviewed" line chart on the dashboard. No new capture, no new route — `GET /api/stats` is extended exactly as SPEC-203 extended it for `bugsByCategory`.

## Files

### Created
- `src/modules/statistics-insights/entities/stats/monthlyVolume.ts` — pure `reviewsPerMonth(reviews, now)` → 12 trailing months zero-filled + `MonthlyVolumePoint`.
- `src/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.ts` — `AnalyticsHeaderPresenter.present(stats, now)` → 3 KPIs (`delta: null`), `reviewsPerMonth`, `isEmpty`, FR `emptyMessage`.
- Tests: `204-analytics-overview-header.acceptance.test.ts` (7 tests / 5 scenarios + 2 payload), `monthlyVolume.test.ts`, `analyticsHeader.presenter.test.ts`.

### Modified
- `src/modules/statistics-insights/services/statsService.ts` — extracted + exported `formatReviewDuration(ms)` (single source of truth; `getStatsSummary` reuses it).
- `src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts` — `analyticsHeader` added to both `/api/stats` branches via the presenter.
- `src/dashboard/modules/statsCharts.js` — `drawReviewsPerMonthChart` (line chart mirroring `drawScoreTrendChart`).
- `src/dashboard/modules/i18n.js` — EN+FR keys (`stats.kpi.prsReviewed`, `stats.kpi.bugsCaught`, `stats.kpi.averageReviewTime`, `stats.reviewsPerMonth`, empty message).
- `src/dashboard/index.html` — 3 KPI cards (animated counters) + empty-state branch + monthly chart canvas/draw/import.
- Extended tests: `stats.routes.test.ts`, `statsCharts.test.ts`, `i18n.test.ts`, `statsService.summary.test.ts`.

## Decisions applied
- **Delta**: `delta: null` on every KPI (field reserved, view hides it). No fake percentages — the design's "+24% vs last year" needs true period-over-period data, deferred.
- **formatDuration**: extracted to exported `formatReviewDuration`.
- **100-review cap**: the monthly chart reads `stats.reviews`, capped at the last 100 by `statsService`. Very active projects may undercount older months. Accepted for v1 — follow-up spec if full-history monthly volume is needed.

## Spec coverage
- nominal KPIs → `nominal` acceptance test
- bugs exclude suggestions → `bugs exclude suggestions`
- monthly volume → `monthly volume`
- delta hidden on thin history → `delta hidden on thin history` (every KPI delta null)
- empty project → `empty project` (FR "Aucune review enregistrée")
- payload shape → 2 route tests

## Out of scope (not built)
"Issues Auto-Fixed" KPI (deferred — no data), true period-over-period delta, configurable periods, per-developer KPIs, Key Insights cards (SPEC-205).
