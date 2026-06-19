# Show the analytics overview header

## Status: implemented

## Context

The dashboard records per-project review stats but offers no at-a-glance headline. A reviewer wants the analytics overview header from the target design: the three headline numbers (how many PRs were reviewed, how many bugs were caught, the average review time) plus the review-volume trend over the year. Every figure already exists in the recorded stats — this surfaces them, it captures nothing new.

## Rules

- the header shows three KPI cards: PRs Reviewed, Bugs Caught, Average Review Time
- "PRs Reviewed" is the total number of reviews recorded for the project
- "Bugs Caught" is the total of blocking plus important findings across all reviews (suggestions are improvements, not bugs, and are excluded)
- "Average Review Time" is the average review duration, shown human-readable (e.g. "4m", "1h 12m")
- a KPI card shows a period-over-period delta only when there is enough history for two comparable periods; otherwise no delta is shown
- the reviews-over-time chart plots the number of reviews per month across the trailing twelve months
- a project with no reviews shows an empty state, not zeroed cards or an empty chart
- the "Issues Auto-Fixed" card from the design is intentionally absent (deferred to a future spec)

## Scenarios

- nominal: {43 reviews, 16 blocking, 41 warnings, average duration 252000 ms} → PRs Reviewed 43 + Bugs Caught 57 + Average Review Time "4m"
- bugs exclude suggestions: {blocking 3, warnings 5, suggestions 10} → Bugs Caught 8
- monthly volume: {reviews dated across January–December} → chart shows one bar/point per month with that month's review count
- delta hidden on thin history: {only one period of data} → cards show their value with no delta
- empty project: {no reviews recorded} → header shows "Aucune review enregistrée"

## Out of Scope

- the "Issues Auto-Fixed" KPI (no data tracked yet — separate future spec)
- the "Bugs Found by Category" chart (SPEC-203, already shipped)
- the "Key Insights" cards (SPEC-205)
- per-developer or per-reviewer KPIs (the team tab already covers people)
- user-configurable periods or custom date ranges
- any new stats capture — the header reads only what reviews already record

## Glossary

| Term | Definition |
|------|------------|
| PRs Reviewed | Total count of reviews recorded for the project |
| Bugs Caught | Total blocking + important findings across all reviews (suggestions excluded) |
| Average Review Time | Mean review duration, formatted for humans |
| Period-over-period delta | The percentage change of a KPI versus the previous comparable period, shown only when history allows |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reads existing stats; independent of SPEC-203 and SPEC-205 |
| Negotiable | OK | Card layout, delta window, and chart granularity left to the planner |
| Valuable | OK | At-a-glance project health for the reviewer |
| Estimable | OK | Bounded: presenter + view over existing `ProjectStats` |
| Small | OK | ~8–12 files including tests; one TDD feature |
| Testable | OK | Each rule has a scenario |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.

## Implementation

### Artefacts
- **Entity** — `monthlyVolume.ts`: pure `reviewsPerMonth(reviews, now)` → 12 trailing months zero-filled.
- **Service** — exported `formatReviewDuration(ms)` extracted from `getStatsSummary` (single source of truth).
- **Presenter** — `analyticsHeader.presenter.ts`: 3 KPI cards (PRs Reviewed, Bugs Caught = blocking + warnings, Average Review Time), `reviewsPerMonth`, `isEmpty`, FR empty message.
- **HTTP** — `GET /api/stats` payload extended with `analyticsHeader` (no new route).
- **View** — `drawReviewsPerMonthChart` (line) in `statsCharts.js` + KPI cards (animated) + i18n (EN/FR) + `index.html` wiring.

### Decisions
- KPI `delta` ships as `null` (field reserved, view hides it) — no fake percentages; true period-over-period delta deferred.
- Monthly chart reads `stats.reviews` (capped at last 100 by `statsService`); older months may undercount for very active projects — accepted for v1.

### Report
See `docs/reports/204-analytics-overview-header.report.md`.
