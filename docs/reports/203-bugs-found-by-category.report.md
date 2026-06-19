# Report — SPEC-203 Track bugs found by category

> Spec: `docs/specs/203-bugs-found-by-category.md`
> Plan: `docs/plans/203-bugs-found-by-category.plan.md`
> Status: implemented — 2026-06-19

## Summary

Implemented the full data path (entity → capture/aggregation service → presenter → HTTP
payload) plus the dashboard view (vertical bar chart + i18n + index.html wiring) for the
project-wide "Bugs Found by Category" breakdown, via TDD inside-out behind a RED-until-green
acceptance test. All four open decisions were applied as resolved:

1. Marker format — appended optional `categories=...` segment to the existing `[REVIEW_STATS:...]` marker (legacy markers → null breakdown).
2. HTTP — extended `GET /api/stats` payload with `bugsByCategory`; no new route.
3. Chart — vertical bars mirroring `drawReviewActivityChart`.
4. Backfill — `recalculateWithBackfill` untouched; legacy reviews contribute zero.

## Files created

- `src/modules/statistics-insights/entities/stats/bugCategory.ts` — closed 6-key `BugCategory` union, ordered key list, display labels, `CategoryBreakdown` type, `emptyBreakdown()`.
- `src/modules/statistics-insights/entities/stats/categoryBreakdown.schema.ts` — Zod record of the 6 keys → non-negative integers.
- `src/modules/statistics-insights/entities/stats/categoryBreakdown.guard.ts` — `normalizeBreakdown` (drop unknown keys, fill missing with 0, coerce invalid→0) + `isValidCategoryBreakdown` / `safeParseCategoryBreakdown`.
- `src/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.ts` — `BugsByCategoryPresenter` producing a 6-bar ViewModel sorted DESC (canonical tiebreak), `isEmpty`, FR empty message.
- `src/tests/acceptance/203-bugs-found-by-category.acceptance.test.ts` — outer-loop acceptance (7 scenarios).
- `src/tests/units/modules/statistics-insights/entities/stats/bugCategory.test.ts`
- `src/tests/units/modules/statistics-insights/entities/stats/categoryBreakdown.guard.test.ts`
- `src/tests/units/services/statsService.category.test.ts`
- `src/tests/units/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.test.ts`

## Files modified

- `src/modules/statistics-insights/entities/stats/projectStats.ts` — `ReviewStats.categoryBreakdown?: CategoryBreakdown | null`; `ProjectStats.categoryBreakdown?: CategoryBreakdown` aggregate.
- `src/modules/statistics-insights/services/statsService.ts` — `parseReviewOutput` parses `categories=` segment (`ParsedReviewOutput`); `addReviewStats` stores breakdown; `initializeCumulativeCounters` backfills the aggregate from existing reviews; `updateAggregatesForNewReview` sums the per-review contribution.
- `src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts` — `bugsByCategory` added to single-project and listing payloads via the presenter.
- `src/dashboard/modules/statsCharts.js` — `drawBugsByCategoryChart` (vertical bars, HiDPI, gradient, FR empty state).
- `src/dashboard/modules/i18n.js` — EN/FR keys: chart title, empty message, 6 category labels.
- `src/dashboard/index.html` — import, canvas card, draw call wired to `data.bugsByCategory`.
- `src/tests/units/interface-adapters/controllers/http/stats.routes.test.ts` — payload coverage.
- `src/tests/units/services/statsService.branches.test.ts` — adapted `parseReviewOutput` assertions to the new return shape (in-scope behaviour change).
- `src/tests/units/dashboard/modules/statsCharts.test.ts` — merged `drawBugsByCategoryChart` tests (one-test-file-per-module convention enforced by `dashboardModulesCoverage.acceptance.test.ts`).
- `docs/feature-tracker.md` — status → implemented.

## Final result

- `yarn verify` (typecheck + lint + test:ci): GREEN.
- Tests: 456 files, 3789 passed, 0 failed.
- Lint: only pre-existing tracked-debt warnings (size limits); zero new errors.
- Acceptance test: GREEN (8 assertions across the 7 spec scenarios).

## Self-review

- Naming: full words, camelCase + domain suffixes.
- Imports: `@/` alias + `.js` everywhere, including tests; no relative imports; no barrel/index.ts.
- TypeScript: zero `any`, zero `as Type` assertions (`as const` only). Closed-set enforcement via Zod + ordered-key iteration.
- Domain: `null` for "no breakdown captured" on a review. The two `=== undefined` checks in `statsService.ts` are presence checks on optional aggregate fields (mirrors the existing `totalScoreSum` convention), not `undefined`-as-absence.
- Tests: factories used, state-based, English only.

## Spec coverage

| Scenario | Covered by |
|---|---|
| nominal capture | acceptance + `statsService.category.test.ts` |
| partial breakdown | acceptance + `categoryBreakdown.guard.test.ts` |
| unknown category ignored | acceptance + guard test |
| aggregation across reviews | acceptance + service test |
| sorted output | acceptance + `bugsByCategory.presenter.test.ts` |
| legacy review without breakdown | acceptance + service test |
| empty project | acceptance + presenter test + chart test (empty-state) |

## HUMBLE GLUE (manual, not in this slice)

The review-skill prompt change that EMITS the `categories=...` marker segment (audit→category
mapping) is a separate manual item requiring one real review run to validate end-to-end. The
parser is implemented to spec and unit-tested with sample marker strings.
