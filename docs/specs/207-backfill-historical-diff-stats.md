# Backfill change-size data for past reviews

## Status: implemented

## Implementation

The backfill infrastructure already existed and is reused as-is:
- Use cases `backfillDiffStats.usecase.ts` + `recalculateWithBackfill.usecase.ts` (recomputes aggregates via `recalculateProjectStats.usecase.ts`)
- HTTP endpoint `POST /api/stats/recalculate` with `{ backfill: true }` (`stats.routes.ts`)
- Dashboard action button `recalculate-btn` (`src/dashboard/index.html`) + `backfill-progress` badge + WebSocket `backfill-progress`/`backfill-complete` + i18n (EN/FR)

The only change required: the backfill filter skipped reviews with `diffStats: null` (treated as "already attempted"). Those nulls were false negatives poisoned by the SPEC-206 bug, so the filter now also re-fetches `diffStats === null` reviews — not only reviews missing the field entirely.

- Changed: `backfillDiffStats.usecase.ts` (filter `diffStats === null || diffStats === undefined`).
- Tests: `src/tests/units/usecases/stats/backfillDiffStats.usecase.test.ts` updated to assert retry-on-null behaviour.
- Depends on SPEC-206 (the fetch must return real numbers before re-fetching, otherwise the backfill rewrites nulls).

## Context

Past reviews recorded empty change-size data because of the broken GitLab source
(fixed in spec-206); fixing the source only helps new reviews. The user needs a
dashboard action that re-fetches change size for all historical reviews that are
missing it, so quality-versus-size analysis covers the whole history.

## Depends on

- spec-206 (the source must return real numbers before backfilling, otherwise the backfill rewrites zeros)

## Rules

- backfill only targets reviews with no change-size data; reviews that already have it are skipped
- each targeted review is re-fetched from its platform diff summary using the merge request number it was recorded under
- a review whose merge request can no longer be fetched is left untouched and counted as failed
- after a backfill run the project totals and averages (total additions, total deletions, average additions, average deletions, count of reviews with change-size data) are recomputed from the reviews
- a backfill run reports how many reviews were updated, skipped, and failed
- the backfill is triggered from a dashboard action button and runs without any AI model
- running the backfill twice produces no further change once every fetchable review has data

## Scenarios

- mixed project: {reviews: 3, missing: 2, all MRs fetchable} → updated 2 + skipped 1 + failed 0 + aggregates recomputed
- already complete: {reviews: 5, missing: 0} → updated 0 + skipped 5 + failed 0
- mr gone: {reviews: 1, missing: 1, mr 404} → updated 0 + skipped 0 + failed 1 + review left untouched
- empty project: {reviews: 0} → updated 0 + skipped 0 + failed 0
- second run: {first run updated 2, then run again} → updated 0 + skipped 3 + failed 0

## Out of Scope

- Rendering additions/deletions in the dashboard (separate follow-up)
- Backfilling token-usage or any non change-size field
- Parallel/locked execution beyond a simple sequential pass per project
- Re-fetching reviews that already have change-size data

## Glossary

| Term | Definition |
|------|------------|
| backfill | A one-shot pass that fills missing change-size data on already-recorded reviews |
| change-size data | The additions, deletions and files-changed counts of a merge/pull request |
| aggregates | Project-level totals and averages derived from all reviews |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | WARN | Sequential dependency on spec-206 (must ship first); no parallel in-flight conflict |
| Negotiable | OK | Spec fixes the outcome (missing reviews filled, aggregates recomputed), not the wiring |
| Valuable | OK | Whole review history becomes usable for size-vs-quality analysis |
| Estimable | OK | Use case + endpoint + button + aggregate recompute |
| Small | OK | <15 files |
| Testable | OK | Each rule maps to a scenario; summary counts are assertable |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.
